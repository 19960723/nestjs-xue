import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 当前接口返回的角色标量字段，不包含用户关联。 */
export class Role {
  @ApiProperty({ description: '角色 ID', type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ description: '角色名称', maxLength: 50, example: '管理员' })
  name!: string;

  @ApiProperty({
    description: '角色编码',
    maxLength: 50,
    example: 'ADMIN',
  })
  code!: string;

  @ApiPropertyOptional({
    description: '角色描述',
    type: String,
    nullable: true,
    example: '系统管理员角色',
  })
  description!: string | null;

  @ApiProperty({
    description: '角色状态：0=禁用，1=启用',
    type: 'integer',
    enum: [0, 1],
    example: 1,
  })
  status!: number;

  @ApiProperty({
    description: '排序值',
    type: 'integer',
    example: 0,
  })
  sort!: number;

  @ApiProperty({
    description: '创建时间',
    type: String,
    format: 'date-time',
    example: '2026-10-27T00:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: '更新时间',
    type: String,
    format: 'date-time',
    example: '2026-10-27T00:00:00.000Z',
  })
  updatedAt!: Date;
}
