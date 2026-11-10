import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { userPublicSelect } from '../users/user.select.js';
import { isDatabaseError } from './database-error.js';
import { PasswordService } from './password.service.js';

const LOGIN_FAILED = '用户名或密码错误';

// 与 PasswordService 同参数的 Argon2id。只用于不存在或未设密的请求，结果不作为登录依据。
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$gFuzNlAWP63U0zANLf9Yng$1eAnFVlUv2tISM38c5SVQUqjPHaTYxAsn92vVXUIfj4';

/** 登录成功交给客户端的令牌。Refresh 原文只出现这一次，库中只存摘要。 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** Access 的业务声明。只放用户、会话和一次性 jti，不放密码、邮箱或权限。 */
interface AccessPayload {
  sub: string;
  sid: string;
  jti: string;
}

/**
 * 用户名密码登录。
 * 不存在、未设密、已禁用、已软删和密码错误都返回同一条 401，避免枚举账号。
 * 哈希在事务外完成；通过后用短事务重读用户再写会话，避免校验期间被禁用或改密。
 * 事务提交后才签 Access。签名失败会撤销尚未交付的会话，响应里不带 token。
 * 本类不实现刷新轮换、退出和改密。
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
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const refreshTtl = this.config.getOrThrow<number>('REFRESH_TTL_SECONDS');
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);
    // 重读确认用户仍可登录，且密码哈希没有在校验期间被换掉。
    const session = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: {
          id: user.id,
          deletedAt: null,
          status: 1,
          password: passwordHash,
        },
        select: { id: true },
      });
      if (!current) {
        return null;
      }

      return tx.userSession.create({
        data: {
          userId: current.id,
          refreshTokenHash,
          expiresAt,
        },
        select: { id: true },
      });
    });

    if (!session) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const accessTtl = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const payload: AccessPayload = {
      sub: String(user.id),
      sid: String(session.id),
      jti: randomUUID(),
    };
    let accessToken: string;
    try {
      accessToken = await this.jwt.signAsync(payload, {
        algorithm: 'HS256',
        expiresIn: accessTtl,
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
    } catch {
      // 会话已经提交，但不能把签不出来的 Access 和配套 Refresh 留给客户端。
      await this.revokeUndeliveredSession(session.id);
      this.logger.error('Access token 签发失败');
      throw new InternalServerErrorException('服务暂不可用');
    }

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
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
        throw new UnauthorizedException('身份无效');
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

  /** 签名失败后的补偿。只标记撤销，不删除记录，也不把 token 写入日志。 */
  private async revokeUndeliveredSession(sessionId: number): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
}
