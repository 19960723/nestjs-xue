import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { AuditService } from './audit.service.js';
import { QueryAuditDto } from './dto/query-audit.dto.js';

/** 审计只读接口。不提供修改或删除。 */
@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({
    summary: '分页查询审计',
    description:
      '按创建时间降序。可按动作、操作者和时间筛选。响应不含密码、哈希或令牌。',
  })
  @ApiOkResponse({
    description: '审计分页结果，data 为 {list,total,page,pageSize}',
  })
  findAll(@Query() query: QueryAuditDto) {
    return this.audit.findAll(query);
  }
}
