import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

/**
 * 审计模块。写入供业务事务调用，查询只读。
 * 没有修改或删除审计的 HTTP 接口。
 */
@Module({
  imports: [CommonModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
