import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

// 只转换十进制数字字符串，避免空串、布尔值或数组被 Number 转为合法数字。
function toQueryInteger({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
}

export class QueryRoleDto {
  @ApiPropertyOptional({
    description: '页码',
    type: 'integer',
    minimum: 1,
    maximum: 2147483647,
    default: 1,
    example: 1,
  })
  @Transform(toQueryInteger)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码不能小于1' })
  @Max(2147483647, { message: '页码不能超过2147483647' })
  page: number = 1;

  @ApiPropertyOptional({
    description: '每页条数',
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @Transform(toQueryInteger)
  @IsInt({ message: '每页条数必须是整数' })
  @Min(1, { message: '每页条数不能小于1' })
  @Max(100, { message: '每页条数不能超过100' })
  pageSize: number = 10;

  @ApiPropertyOptional({
    description: '按角色名称或编码模糊搜索，空字符串表示不筛选',
    maxLength: 50,
    example: 'ADMIN',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: '搜索关键字必须是字符串' })
  @MaxLength(50, { message: '搜索关键字不能超过50个字符' })
  keyword?: string;

  @ApiPropertyOptional({
    description: '角色状态：0=禁用，1=启用；不传则不按状态筛选',
    type: 'integer',
    enum: [0, 1],
    example: 1,
  })
  @Transform(toQueryInteger)
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt({ message: '角色状态必须是整数' })
  @IsIn([0, 1], { message: '角色状态只能为0或1' })
  status?: number;
}
