import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_RATE_LIMIT_KEY } from '../../infrastructure/redis/skip-rate-limit.decorator.js';
import { RateLimitService } from '../../infrastructure/redis/rate-limit.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

/**
 * 全局入口。先占用全局限流，再确认 Access，最后核对权限。
 * 限流放在身份校验前面，Redis 故障时直接 503，不再查询用户或会话。
 * 三个检查固定按这个顺序执行，避免只注册其中一个。
 */
@Injectable()
export class ApiGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
    private readonly access: JwtAuthGuard,
    private readonly permissions: PermissionsGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.consumeRateLimit(context);
    const authenticated = await this.access.canActivate(context);
    if (!authenticated) {
      return false;
    }
    return this.permissions.canActivate(context);
  }

  /** 存活探针跳过。其余 HTTP 请求按套接字地址计数，不看转发头。 */
  private async consumeRateLimit(context: ExecutionContext): Promise<void> {
    const skipped = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipped || context.getType() !== 'http') {
      return;
    }
    const request = context.switchToHttp().getRequest<{
      socket?: { remoteAddress?: unknown };
    }>();
    const address = request.socket?.remoteAddress;
    await this.rateLimit.consume(
      typeof address === 'string' ? address : 'unknown',
    );
  }
}
