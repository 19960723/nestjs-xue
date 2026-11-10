import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { userPublicSelect } from '../users/user.select.js';
import { isDatabaseError } from './database-error.js';
import { PasswordService } from './password.service.js';

const LOGIN_FAILED = '用户名或密码错误';
const INVALID_IDENTITY = '身份无效';
const OLD_PASSWORD_FAILED = '原密码错误';
const PASSWORD_CONFLICT = '密码已变更';
const ROTATE_ATTEMPTS = 3;

// 与 PasswordService 同参数的 Argon2id。只用于不存在或未设密的请求，结果不作为登录依据。
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$gFuzNlAWP63U0zANLf9Yng$1eAnFVlUv2tISM38c5SVQUqjPHaTYxAsn92vVXUIfj4';

/** 登录或刷新成功交给客户端的令牌。Refresh 原文只出现这一次，库中只存摘要。 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** Access 的业务声明。只放用户、会话、版本和一次性 jti，不放密码、邮箱或权限。 */
interface AccessPayload {
  sub: string;
  sid: string;
  ver: number;
  jti: string;
}

type RefreshOutcome =
  | { kind: 'invalid' }
  | { kind: 'replay' }
  | {
      kind: 'issued';
      userId: number;
      sessionId: number;
      tokenVersion: number;
      refreshToken: string;
    };

/** 轮换过程中会话已被关闭。抛出它是为了回滚本次消费，调用方再返回 401。 */
class SessionClosedDuringRefresh extends Error {}

function refreshHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * 用户名密码登录，以及 Refresh 的单次轮换。
 * 登录失败不区分没有这个人、未设密、已禁用、已软删和密码错误。
 * 哈希在事务外完成；通过后用短事务重读用户再写会话和第一条 Refresh 记录。
 * 刷新时旧记录只消费一次。条件更新没有命中，或旧记录已经用过，就撤销整段会话；
 * 撤销随事务提交，提交后才返回 401。事务内不能抛 401，否则撤销会一起回滚。
 * 未知、过期、已撤销、禁用和软删都只返回 401，不扩大撤销范围。
 * 新 Refresh 的到期时间不超过会话创建时间加上 SESSION_MAX_TTL_SECONDS。
 * 当前退出只撤销这一条会话。全部退出和修改密码会把 tokenVersion 加一，并撤销该用户全部会话。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 校验凭据并创建一条会话。
   * Refresh 是 32 字节随机值，入库的是它的 SHA-256 十六进制摘要。
   */
  async login(username: string, password: string): Promise<TokenSet> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, password: true, status: true, deletedAt: true },
    });
    const passwordHash = user?.password ?? null;
    const passwordMatches =
      passwordHash === null
        ? await this.passwords.verify(DUMMY_PASSWORD_HASH, password)
        : await this.passwords.verify(passwordHash, password);
    const canLogin =
      user !== null &&
      passwordHash !== null &&
      user.deletedAt === null &&
      user.status === 1 &&
      passwordMatches;

    // 失败文案保持一致，调用方不能从异常区分是没有这个人还是密码错了。
    if (!canLogin || !user || passwordHash === null) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = refreshHash(refreshToken);
    const now = new Date();
    const expiresAt = this.refreshWindow(now, this.absoluteEnd(now));
    if (!expiresAt) {
      throw new InternalServerErrorException('服务暂不可用');
    }
    // 先锁用户行，再确认仍可登录且密码哈希没有在校验期间被换掉。
    const session = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const current = await tx.user.findFirst({
        where: {
          id: user.id,
          deletedAt: null,
          status: 1,
          password: passwordHash,
        },
        select: { id: true, tokenVersion: true },
      });
      if (!current) {
        return null;
      }

      const created = await tx.userSession.create({
        data: {
          userId: current.id,
          refreshTokenHash: tokenHash,
          expiresAt,
        },
        select: { id: true },
      });
      await tx.refreshToken.create({
        data: {
          sessionId: created.id,
          tokenHash,
          expiresAt,
        },
      });
      return { id: created.id, tokenVersion: current.tokenVersion };
    });

    if (!session) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const accessToken = await this.signAccess(
      user.id,
      session.id,
      session.tokenVersion,
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
    };
  }

  /**
   * 用尚未使用的 Refresh 换一组新令牌。
   * 客户端必须串行刷新。并行的第二次请求会撤销整段会话，先返回的新令牌也会失效。
   * 数据库故障返回 503，不签发新令牌。
   */
  async refresh(refreshToken: string): Promise<TokenSet> {
    let outcome: RefreshOutcome;
    try {
      outcome = await this.rotateWithRetry(refreshToken);
    } catch (error: unknown) {
      if (error instanceof SessionClosedDuringRefresh) {
        throw new UnauthorizedException(INVALID_IDENTITY);
      }
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
    if (outcome.kind !== 'issued') {
      throw new UnauthorizedException(INVALID_IDENTITY);
    }

    const accessToken = await this.signAccess(
      outcome.userId,
      outcome.sessionId,
      outcome.tokenVersion,
    );
    return {
      accessToken,
      refreshToken: outcome.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
    };
  }

  /**
   * 返回当前 Access 对应用户的公开资料。
   * Guard 已核对会话；这里再确认用户仍启用且未删除，避免把刚被禁用的资料返回出去。
   * 查不到时返回 401，不使用 404，避免暴露账号是否存在。
   */
  async currentUser(userId: number) {
    try {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null, status: 1 },
        select: userPublicSelect,
      });
      if (!user) {
        throw new UnauthorizedException(INVALID_IDENTITY);
      }
      return user;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }

  /** 事务冲突时重新读取状态。重放撤销一旦提交就不再重试。 */
  private async rotateWithRetry(refreshToken: string): Promise<RefreshOutcome> {
    const tokenHash = refreshHash(refreshToken);
    let lastError: unknown;
    for (let attempt = 1; attempt <= ROTATE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) =>
          this.rotateOnce(tx, tokenHash),
        );
      } catch (error: unknown) {
        lastError = error;
        if (this.isWriteConflict(error) && attempt < ROTATE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * 撤销当前 Access 对应的会话。其它登录不受影响，也不提升 tokenVersion。
   * 会话已经撤销时仍然返回成功；随后同一个 Access 会在 Guard 得到 401。
   */
  async logout(sessionId: number): Promise<null> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const session = await tx.userSession.findUnique({
          where: { id: sessionId },
          select: { userId: true },
        });
        if (!session) {
          return;
        }
        await this.lockUser(tx, session.userId);
        await tx.userSession.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
      return null;
    } catch (error: unknown) {
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }

  /**
   * 结束该用户的全部登录。tokenVersion 先加一，再撤销尚未撤销的会话。
   * 旧 Access 因版本不符失效，旧 Refresh 因会话撤销失效。
   */
  async logoutAll(userId: number): Promise<null> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        await tx.user.update({
          where: { id: userId },
          data: { tokenVersion: { increment: 1 } },
        });
        await tx.userSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
      return null;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new UnauthorizedException(INVALID_IDENTITY);
      }
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }

  /**
   * 核对原密码后更换哈希。新哈希在事务外计算。
   * 事务内要求原哈希和 tokenVersion 都没变，才替换密码、版本加一并撤销全部会话。
   * 条件不满足返回 409。原密码错误、未设密、已禁用或已删除都返回同一条 401。
   */
  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
        tokenVersion: true,
        status: true,
        deletedAt: true,
      },
    });
    const passwordHash = user?.password ?? null;
    const passwordMatches =
      passwordHash === null
        ? await this.passwords.verify(DUMMY_PASSWORD_HASH, oldPassword)
        : await this.passwords.verify(passwordHash, oldPassword);
    if (
      !user ||
      user.deletedAt !== null ||
      user.status !== 1 ||
      passwordHash === null ||
      !passwordMatches
    ) {
      throw new UnauthorizedException(OLD_PASSWORD_FAILED);
    }

    const nextHash = await this.passwords.hash(newPassword);
    try {
      const changed = await this.prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        const updated = await tx.user.updateMany({
          where: {
            id: userId,
            password: passwordHash,
            tokenVersion: user.tokenVersion,
            deletedAt: null,
            status: 1,
          },
          data: {
            password: nextHash,
            tokenVersion: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          return false;
        }
        await tx.userSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return true;
      });
      if (!changed) {
        throw new ConflictException(PASSWORD_CONFLICT);
      }
      return null;
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }

  /**
   * 在一个事务里消费旧 Refresh。先锁用户行，再判断这张凭据。
   * 已经用过则撤销会话并正常返回，让撤销能够提交。
   * 条件更新影响行数不是 1，同样按重放处理。
   */
  private async rotateOnce(
    tx: Prisma.TransactionClient,
    tokenHash: string,
  ): Promise<RefreshOutcome> {
    const located = await tx.refreshToken.findUnique({
      where: { tokenHash },
      select: { session: { select: { userId: true } } },
    });
    if (!located) {
      return { kind: 'invalid' };
    }

    await this.lockUser(tx, located.session.userId);
    const record = await tx.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
        session: {
          select: {
            id: true,
            revokedAt: true,
            expiresAt: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                status: true,
                deletedAt: true,
                tokenVersion: true,
              },
            },
          },
        },
      },
    });
    if (!record) {
      return { kind: 'invalid' };
    }

    const now = new Date();
    if (record.usedAt !== null) {
      await tx.userSession.update({
        where: { id: record.session.id },
        data: { revokedAt: record.session.revokedAt ?? now },
      });
      return { kind: 'replay' };
    }

    const absoluteEnd = this.absoluteEnd(record.session.createdAt);
    const user = record.session.user;
    const reusable =
      record.expiresAt > now &&
      record.session.revokedAt === null &&
      record.session.expiresAt > now &&
      absoluteEnd > now &&
      user.deletedAt === null &&
      user.status === 1;
    if (!reusable) {
      return { kind: 'invalid' };
    }

    const consumed = await tx.refreshToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) {
      await tx.userSession.update({
        where: { id: record.session.id },
        data: { revokedAt: now },
      });
      return { kind: 'replay' };
    }

    const refreshToken = randomBytes(32).toString('base64url');
    const nextHash = refreshHash(refreshToken);
    const expiresAt = this.refreshWindow(now, absoluteEnd);
    if (!expiresAt) {
      throw new SessionClosedDuringRefresh();
    }

    await tx.refreshToken.create({
      data: {
        sessionId: record.session.id,
        tokenHash: nextHash,
        expiresAt,
      },
    });
    const moved = await tx.userSession.updateMany({
      where: { id: record.session.id, revokedAt: null },
      data: { refreshTokenHash: nextHash, expiresAt },
    });
    if (moved.count !== 1) {
      throw new SessionClosedDuringRefresh();
    }

    return {
      kind: 'issued',
      userId: user.id,
      sessionId: record.session.id,
      tokenVersion: user.tokenVersion,
      refreshToken,
    };
  }

  /** 空闲窗口和会话绝对上限里更早的那个时刻。已经到期则不能再发令牌。 */
  private refreshWindow(now: Date, absoluteEnd: Date): Date | null {
    const refreshTtl = this.config.getOrThrow<number>('REFRESH_TTL_SECONDS');
    const idleEnd = new Date(now.getTime() + refreshTtl * 1000);
    const expiresAt = idleEnd < absoluteEnd ? idleEnd : absoluteEnd;
    return expiresAt > now ? expiresAt : null;
  }

  /** 会话从创建时刻起的最长寿命，刷新不能把它往后推。 */
  private absoluteEnd(createdAt: Date): Date {
    const sessionMax = this.config.getOrThrow<number>(
      'SESSION_MAX_TTL_SECONDS',
    );
    return new Date(createdAt.getTime() + sessionMax * 1000);
  }

  /** 事务提交后才签名。ver 使用事务里读到的版本。失败时撤销尚未交付的会话，响应里不带 token。 */
  private async signAccess(
    userId: number,
    sessionId: number,
    tokenVersion: number,
  ): Promise<string> {
    const payload: AccessPayload = {
      sub: String(userId),
      sid: String(sessionId),
      ver: tokenVersion,
      jti: randomUUID(),
    };
    try {
      return await this.jwt.signAsync(payload, {
        algorithm: 'HS256',
        expiresIn: this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
    } catch {
      await this.revokeUndeliveredSession(sessionId);
      this.logger.error('Access token 签发失败');
      throw new InternalServerErrorException('服务暂不可用');
    }
  }

  /** 签名失败后的补偿。只标记撤销，不删除记录，也不把 token 写入日志。 */
  private async revokeUndeliveredSession(sessionId: number): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  /** 锁住用户行，让登录、刷新、退出和改密按同一顺序等待。 */
  private async lockUser(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  }

  private isWriteConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
