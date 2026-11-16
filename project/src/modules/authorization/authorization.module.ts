import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ApiGuard } from './api.guard.js';
import { AuthorizationService } from './authorization.service.js';
import { PermissionsController } from './permissions.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RolePermissionsController } from './role-permissions.controller.js';
import { UserRolesController } from './user-roles.controller.js';

/**
 * 授权模块。提供权限 Guard，以及权限目录和角色分配接口。
 * 不在启动时写入角色或管理员。ApiGuard 由 AppModule 注册为唯一的全局 Guard。
 * AuditModule 给角色替换写同一事务的审计，权限拒绝只写安全日志。
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    PermissionsController,
    RolePermissionsController,
    UserRolesController,
  ],
  providers: [PermissionsGuard, ApiGuard, AuthorizationService],
  exports: [PermissionsGuard, ApiGuard],
})
export class AuthorizationModule {}
