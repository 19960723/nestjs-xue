import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { AuditAction } from '../audit.service.js';

const AUDIT_ACTIONS = Object.values(AuditAction);

/** 审计分页查询。只筛选已有记录，不接收修改或删除参数。 */
export class QueryAuditDto {
  @ApiPropertyOptional({
    description: '页码',
    type: 'integer',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: '每页条数',
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10;

  @ApiPropertyOptional({
    description: '动作',
    enum: AUDIT_ACTIONS,
  })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: (typeof AUDIT_ACTIONS)[number];

  @ApiPropertyOptional({
    description: '操作者用户 ID',
    type: 'integer',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  actorId?: number;

  @ApiPropertyOptional({
    description: '开始时间，含该时刻，ISO 8601',
    example: '2026-11-16T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: '结束时间，含该时刻，ISO 8601',
    example: '2026-11-16T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
