import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { AuditService } from './audit.service.js';

/**
 * 审计模块。只导出写入服务。
 * 没有查询、修改或删除审计的 HTTP 接口。
 */
@Module({
  imports: [CommonModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
