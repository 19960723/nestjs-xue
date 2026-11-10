import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 用户分页查询。页码从 1 开始，关键字只作为资料搜索，不参与认证。 */
export class QueryUserDto {
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
    description: '按用户名、昵称或邮箱模糊搜索',
    example: 'example.test',
  })
  @IsOptional()
  @IsString()
  keyword?: string;
}
