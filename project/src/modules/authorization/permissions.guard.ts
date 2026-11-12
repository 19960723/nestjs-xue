import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';
import { IS_AUTHENTICATED_KEY } from '../../common/decorators/authenticated.decorator.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';

const FORBIDDEN = '权限不足';

interface RequestWithUser {
  user?: { id: number };
}

/**
 * 在 Access 校验之后执行。每次请求直接查库，不读 JWT 里的角色。
 * Public 放行。Authenticated 只要求已登录。RequirePermissions 要求全部权限码都挂在启用角色上。
 * 没有声明、声明冲突或权限不足返回 403。数据库故障返回 503，不放行。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isAuthenticated = this.reflector.getAllAndOverride<boolean>(
      IS_AUTHENTICATED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const permissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const declared = Array.isArray(permissions) ? permissions : [];
    if (isPublic && (isAuthenticated || declared.length > 0)) {
      throw new ForbiddenException(FORBIDDEN);
    }
    if (isPublic) {
      return true;
    }
    if (isAuthenticated && declared.length > 0) {
      throw new ForbiddenException(FORBIDDEN);
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;
    if (isAuthenticated) {
      if (!userId) {
        throw new UnauthorizedException('身份无效');
      }
      return true;
    }
    if (!userId || declared.length === 0) {
      throw new ForbiddenException(FORBIDDEN);
    }

    let granted: string[];
    try {
      const rows = await this.prisma.permission.findMany({
        where: {
          code: { in: declared },
          status: 1,
          roles: {
            some: {
              role: {
                status: 1,
                users: {
                  some: {
                    userId,
                    user: { deletedAt: null, status: 1 },
                  },
                },
              },
            },
          },
        },
        select: { code: true },
      });
      granted = rows.map((row) => row.code);
    } catch (error: unknown) {
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }

    const owned = new Set(granted);
    if (declared.some((code) => !owned.has(code))) {
      throw new ForbiddenException(FORBIDDEN);
    }
    return true;
  }
}

function isDatabaseError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  );
}
