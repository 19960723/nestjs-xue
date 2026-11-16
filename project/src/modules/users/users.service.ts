import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { userPublicSelect } from './user.select.js';

/**
 * 用户资料。创建和更新不接收密码、状态或角色。
 * 查询一律用公开字段，响应里没有密码和删除时间。
 * 首次设密只在密码仍为空、未删除且启用时写入；哈希在更新前计算。
 * 删除写入 deletedAt，并撤销该用户全部会话。已删除用户按不存在处理。
 * 详情在确认未删除后可读短时展示缓存。资料、状态、设密和删除提交后再删缓存。
 * 启用、停用和软删除成功时在同一事务写审计，不记录密码或令牌。
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** 把唯一索引冲突换成字段文案。认不出字段时仍返回 409，不把 Prisma 内部信息交给客户端。 */
  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const targetText = Array.isArray(target)
        ? target.join(' ')
        : String(target ?? '');
      const text = `${targetText} ${error.message}`;

      if (text.includes('username')) {
        throw new ConflictException('用户名已被使用');
      }

      if (text.includes('phone')) {
        throw new ConflictException('手机号已被使用');
      }

      if (text.includes('email')) {
        throw new ConflictException('邮箱已被使用');
      }

      throw new ConflictException('唯一字段冲突');
    }

    throw error;
  }

  /** 只挑资料字段。显式传入的邮箱 null 在这里拒绝，不能把必填邮箱清空。 */
  private profileData(dto: UpdateUserDto) {
    if (dto.email === null) {
      throw new BadRequestException('邮箱不能为空');
    }

    return {
      email: dto.email,
      username: dto.username,
      nickname: dto.nickname,
      phone: dto.phone,
      sex: dto.sex,
      avatar: dto.avatar,
    };
  }

  /** 创建资料，不写密码。新用户在首次设密前不能登录。 */
  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          nickname: dto.nickname,
          phone: dto.phone,
          sex: dto.sex,
          avatar: dto.avatar,
        },
        select: userPublicSelect,
      });
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  /** 分页列表。已删除用户不出现。列表和总数用同一条件，关键字只匹配用户名、昵称和邮箱。 */
  async findAll(query: QueryUserDto) {
    const { page, pageSize, keyword } = query;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { nickname: { contains: keyword } },
              { email: { contains: keyword } },
            ],
          }
        : {}),
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userPublicSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      list,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 按主键返回未删除用户的公开资料。响应里不含删除时间。
   * 先用 MySQL 确认未删除，已删用户不能从缓存里回来。
   * 展示缓存 60 秒再加 0～15 秒。它只给详情展示用，登录和权限不读。
   */
  async findOne(id: number) {
    const visible = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!visible) {
      await this.redis.forget('users:profile', id);
      throw new NotFoundException('用户不存在');
    }

    const cached = parseProfile(
      await this.redis.readJson('users:profile', id),
      id,
    );
    if (cached) {
      return cached;
    }

    const user = await this.loadPublic(id);
    if (!user) {
      await this.redis.forget('users:profile', id);
      throw new NotFoundException('用户不存在');
    }
    await this.redis.writeJson(
      'users:profile',
      id,
      user,
      60 + Math.floor(Math.random() * 16),
    );
    return user;
  }

  /** 直接读公开资料，给写操作返回最新值，不走展示缓存。 */
  private async loadPublic(id: number) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userPublicSelect,
    });
  }

  /** 写操作提交后的回读。不走缓存，避免刚删掉的旧资料又被返回。 */
  private async requirePublic(id: number) {
    const user = await this.loadPublic(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  /**
   * 条件更新写入第一份密码。条件里同时要求密码为空、未删除且启用，避免先查再改的空窗。
   * 没写上时再读状态，区分不存在、已禁用和已设密；读和重试之间仍可能被别人设密。
   * 写入成功后删除展示缓存，返回值改从 MySQL 读。
   */
  async setInitialPassword(id: number, password: string) {
    const passwordHash = await this.passwords.hash(password);
    const updated = await this.prisma.user.updateMany({
      where: {
        id,
        password: null,
        deletedAt: null,
        status: 1,
      },
      data: { password: passwordHash },
    });

    if (updated.count === 1) {
      await this.redis.forget('users:profile', id);
      return this.requirePublic(id);
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        deletedAt: true,
        status: true,
        password: true,
      },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    if (existing.status !== 1) {
      throw new ConflictException('用户已禁用');
    }

    if (existing.password !== null) {
      throw new ConflictException('密码已设置');
    }

    const retried = await this.prisma.user.updateMany({
      where: {
        id,
        password: null,
        deletedAt: null,
        status: 1,
      },
      data: { password: passwordHash },
    });

    if (retried.count === 1) {
      await this.redis.forget('users:profile', id);
      return this.requirePublic(id);
    }

    throw new ConflictException('密码已设置');
  }

  /**
   * 改启用状态。停用时版本加一并撤销全部会话，旧 Access 下一请求失效。
   * 启用只改状态，不恢复已撤销的会话。事务提交后再删展示缓存；用户已不存在时也删。
   * 状态确实变化后才写审计。已经是目标状态时不记。
   */
  async updateStatus(actorId: number, id: number, status: number) {
    if (actorId === id && status === 0) {
      throw new ForbiddenException('不能停用自己');
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        if (status === 0) {
          await tx.$queryRaw`
            SELECT id FROM roles WHERE code = 'admin' AND is_system = 1 FOR UPDATE
          `;
        }

        const current = await tx.user.findUnique({
          where: { id },
          select: { id: true, status: true, deletedAt: true },
        });
        if (!current || current.deletedAt !== null) {
          throw new NotFoundException('用户不存在');
        }
        if (current.status === status) {
          return tx.user.findUniqueOrThrow({
            where: { id },
            select: userPublicSelect,
          });
        }

        if (status === 0) {
          await this.ensureRemainingAdmin(tx, id);
          await tx.user.update({
            where: { id },
            data: { status: 0, tokenVersion: { increment: 1 } },
          });
          await tx.userSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        } else {
          await tx.user.update({
            where: { id },
            data: { status: 1 },
          });
        }

        await this.audit.record(tx, {
          actorUserId: actorId,
          action:
            status === 0 ? AuditAction.userDisable : AuditAction.userEnable,
          targetType: 'user',
          targetId: id,
        });

        return tx.user.findUniqueOrThrow({
          where: { id },
          select: userPublicSelect,
        });
      });
      await this.redis.forget('users:profile', id);
      return user;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        await this.redis.forget('users:profile', id);
      }
      throw error;
    }
  }

  /** 停用或删除系统管理员前，必须还留有另一名启用且未删除的管理员。 */
  private async ensureRemainingAdmin(
    tx: Prisma.TransactionClient,
    userId: number,
  ) {
    const admin = await tx.role.findUnique({
      where: { code: 'admin' },
      select: { id: true, isSystem: true, status: true },
    });
    if (!admin?.isSystem || admin.status !== 1) {
      return;
    }
    const holds = await tx.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: admin.id } },
    });
    if (!holds) {
      return;
    }
    const others = await tx.userRole.count({
      where: {
        roleId: admin.id,
        userId: { not: userId },
        user: { deletedAt: null, status: 1 },
      },
    });
    if (others < 1) {
      throw new ConflictException('必须保留至少一名有效管理员');
    }
  }

  /** 只改未删除用户的资料。不在这里改密码、状态或角色。提交成功或用户已不存在时删除展示缓存。 */
  async update(id: number, dto: UpdateUserDto) {
    try {
      const updated = await this.prisma.user.updateMany({
        where: { id, deletedAt: null },
        data: this.profileData(dto),
      });
      if (updated.count !== 1) {
        await this.redis.forget('users:profile', id);
        throw new NotFoundException('用户不存在');
      }
      await this.redis.forget('users:profile', id);
      return this.requirePublic(id);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.handleWriteError(error);
    }
  }

  /**
   * 软删除。写入删除时间，版本加一，并撤销全部未撤销会话。
   * 不能删除自己，也不能删除最后一名有效管理员。角色关联保留，身份仍被占用。
   * 事务提交后再删展示缓存。删除失败不回滚数据库，剩下的值靠有效期消失。
   * 软删除成功后同一事务写审计。
   */
  async remove(actorId: number, id: number): Promise<null> {
    if (actorId === id) {
      throw new ForbiddenException('不能删除自己');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM roles WHERE code = 'admin' AND is_system = 1 FOR UPDATE
      `;
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt !== null) {
        throw new NotFoundException('用户不存在');
      }

      await this.ensureRemainingAdmin(tx, id);
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), tokenVersion: { increment: 1 } },
      });
      await tx.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(tx, {
        actorUserId: actorId,
        action: AuditAction.userDelete,
        targetType: 'user',
        targetId: id,
      });
    });

    await this.redis.forget('users:profile', id);
    return null;
  }
}

/** 与 userPublicSelect 一一对应。多字段或少字段都当缓存损坏。 */
const PROFILE_FIELDS = [
  'id',
  'username',
  'nickname',
  'avatar',
  'email',
  'phone',
  'sex',
  'status',
  'lastLoginAt',
  'createdAt',
  'updatedAt',
] as const;

type PublicUser = {
  id: number;
  username: string | null;
  nickname: string | null;
  avatar: string | null;
  email: string;
  phone: string | null;
  sex: number | null;
  status: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

/** 缓存是外部数据。字段、类型或日期对不上就当未命中，不能按未知结构直接返回。 */
function parseProfile(value: unknown, id: number): PublicUser | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== PROFILE_FIELDS.length ||
    PROFILE_FIELDS.some((field) => !Object.hasOwn(record, field))
  ) {
    return null;
  }
  if (record.id !== id) {
    return null;
  }
  const username = optionalText(record.username);
  const nickname = optionalText(record.nickname);
  const avatar = optionalText(record.avatar);
  const phone = optionalText(record.phone);
  const email = record.email;
  const sex = optionalInteger(record.sex);
  const status = record.status;
  const lastLoginAt = optionalDate(record.lastLoginAt);
  const createdAt = requiredDate(record.createdAt);
  const updatedAt = optionalDate(record.updatedAt);
  if (
    username === undefined ||
    nickname === undefined ||
    avatar === undefined ||
    phone === undefined ||
    typeof email !== 'string' ||
    email.length < 1 ||
    email.length > 100 ||
    sex === undefined ||
    (status !== 0 && status !== 1) ||
    lastLoginAt === undefined ||
    createdAt === undefined ||
    updatedAt === undefined
  ) {
    return null;
  }
  return {
    id,
    username,
    nickname,
    avatar,
    email,
    phone,
    sex,
    status,
    lastLoginAt,
    createdAt,
    updatedAt,
  };
}

/** undefined 表示类型不对，null 表示数据库里的空值。类型不对时整份缓存作废。 */
function optionalText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.length > 255) {
    return undefined;
  }
  return value;
}

function optionalInteger(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return undefined;
  }
  return value;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === null) {
    return null;
  }
  return requiredDate(value);
}

function requiredDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return undefined;
  }
  return new Date(time);
}
