import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { RequestContextService } from '../../common/request-context.service.js';

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
  constructor(private readonly requestContext: RequestContextService) {}

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
}
