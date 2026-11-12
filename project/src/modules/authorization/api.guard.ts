import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

/**
 * 全局入口。先确认 Access，再核对权限。
 * 两个 Guard 固定按这个顺序执行，避免只注册其中一个。
 */
@Injectable()
export class ApiGuard implements CanActivate {
  constructor(
    private readonly access: JwtAuthGuard,
    private readonly permissions: PermissionsGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await this.access.canActivate(context);
    if (!authenticated) {
      return false;
    }
    return this.permissions.canActivate(context);
  }
}
