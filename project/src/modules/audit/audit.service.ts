import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { RequestContextService } from '../../common/request-context.service.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { QueryAuditDto } from './dto/query-audit.dto.js';

/** 已成功提交的动作。拒绝和失败不使用这些名字。 */
export const AuditAction = {
  userEnable: 'users.enable',
  userDisable: 'users.disable',
  userDelete: 'users.delete',
  userRoles: 'users.assign-roles',
  changePassword: 'auth.change-password',
  logout: 'auth.logout',
  logoutAll: 'auth.logout-all',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * 在调用方的事务里写审计。
 * 只保存操作者、动作、对象和 requestId。不接收密码、哈希、令牌或请求正文。
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly prisma: PrismaService,
  ) {}

  async record(
    tx: Prisma.TransactionClient,
    input: {
      actorUserId: number;
      action: AuditActionName;
      targetType: 'user' | 'session';
      targetId: number;
    },
  ): Promise<void> {
    const requestId = this.requestContext.getRequestId().slice(0, 64);
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: String(input.targetId),
        requestId,
      },
    });
  }

  /**
   * 分页返回审计。时间两端都包含。开始晚于结束时拒绝。
   * 查询字段与写入字段相同，没有密码、哈希或令牌。
   */
  async findAll(query: QueryAuditDto) {
    const from = parseInstant(query.from);
    const to = parseInstant(query.to);
    if (from && to && from > to) {
      throw new BadRequestException('开始时间不能晚于结束时间');
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId === undefined ? {} : { actorUserId: query.actorId }),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          actorUserId: true,
          action: true,
          targetType: true,
          targetId: true,
          requestId: true,
          createdAt: true,
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      list,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}

function parseInstant(value: string | undefined): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new BadRequestException('时间格式无效');
  }
  return instant;
}
