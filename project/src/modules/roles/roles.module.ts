import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RolesService } from './roles.service.js';
import { RolesController } from './roles.controller.js';

/**
 * 角色模块。显式导入 PrismaModule，查询仍直接使用全局 PrismaService。
 * AuditModule 给角色资料变更写同一事务的审计。
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
