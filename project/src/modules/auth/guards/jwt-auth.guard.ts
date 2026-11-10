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
const INT_MAX = 2147483647;

interface AuthenticatedRequest {
  headers: { authorization?: string | string[] };
  user?: AuthenticatedUser;
}

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
    if (userId === null || sessionId === null) {
      throw new UnauthorizedException(INVALID_IDENTITY);
    }

    const session = await this.findActiveSession(sessionId, userId);
    if (!session) {
      throw new UnauthorizedException(INVALID_IDENTITY);
    }

    request.user = { id: userId, sessionId };
    return true;
  }

  private async verifyPayload(
    token: string,
  ): Promise<{ sub: unknown; sid: unknown }> {
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
      return { sub: record.sub, sid: record.sid };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(INVALID_IDENTITY);
    }
  }

  private async findActiveSession(
    sessionId: number,
    userId: number,
  ): Promise<{ id: number } | null> {
    try {
      return await this.prisma.userSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { deletedAt: null, status: 1 },
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
