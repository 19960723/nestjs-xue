import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma/prisma.service.js';
import { isDatabaseError } from '../database-error.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

const INVALID_IDENTITY = '身份无效';
/** 会话主键是有符号 INT，超过这个值不能当作合法 sid。 */
const INT_MAX = 2147483647;

interface AuthenticatedRequest {
  headers: { authorization?: string | string[] };
  user?: AuthenticatedUser;
}

/** 只接受唯一的 "Bearer <token>"。数组头、缺段或多段都视为没有令牌。 */
function readBearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || parts[1].length === 0) {
    return null;
  }
  return parts[1];
}

/** tokenVersion 来自服务端签发的整数，不接受字符串或小数。 */
function nonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }
  if (value < 0 || value > INT_MAX) {
    return null;
  }
  return value;
}

/** 只接受不含前导零的十进制正整数字符串，并限制在 MySQL INT 范围内。 */
function positiveIntString(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > INT_MAX) {
    return null;
  }
  return parsed;
}

/**
 * 校验 Access，通过后只把 { id, sessionId, tokenVersion } 挂到请求上。
 * 缺 token、签名或签发方不符、sub/sid/ver 非法、版本不一致、会话撤销或过期、用户禁用或已删，
 * 都返回同一条 401。数据库故障返回 503，不放行。日志不记录 token。
 * AuthModule 已把它注册为全局 Guard。只有标了 @Public() 的路由跳过校验。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    if (context.getType() !== 'http') {
      throw new UnauthorizedException(INVALID_IDENTITY);
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException(INVALID_IDENTITY);
    }

    const payload = await this.verifyPayload(token);
    const userId = positiveIntString(payload.sub);
    const sessionId = positiveIntString(payload.sid);
    const tokenVersion = nonNegativeInt(payload.ver);
    if (userId === null || sessionId === null || tokenVersion === null) {
      throw new UnauthorizedException(INVALID_IDENTITY);
    }

    const session = await this.findActiveSession(
      sessionId,
      userId,
      tokenVersion,
    );
    if (!session) {
      throw new UnauthorizedException(INVALID_IDENTITY);
    }

    request.user = { id: userId, sessionId, tokenVersion };
    return true;
  }

  /** 固定 HS256 和已配置的 issuer、audience。验签失败不区分过期、算法或密钥错误。 */
  private async verifyPayload(
    token: string,
  ): Promise<{ sub: unknown; sid: unknown; ver: unknown }> {
    try {
      const payload: unknown = await this.jwt.verifyAsync(token, {
        algorithms: ['HS256'],
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      if (typeof payload !== 'object' || payload === null) {
        throw new UnauthorizedException(INVALID_IDENTITY);
      }
      const record = payload as Record<string, unknown>;
      return { sub: record.sub, sid: record.sid, ver: record.ver };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(INVALID_IDENTITY);
    }
  }

  /** 会话必须属于该用户、未撤销且未过期，用户仍启用未删除，且版本与 Access 一致。查询异常不当成 401。 */
  private async findActiveSession(
    sessionId: number,
    userId: number,
    tokenVersion: number,
  ): Promise<{ id: number } | null> {
    try {
      return await this.prisma.userSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { deletedAt: null, status: 1, tokenVersion },
        },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }
}
