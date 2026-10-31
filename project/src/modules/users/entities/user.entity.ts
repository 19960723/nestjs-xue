import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 当前接口返回的用户标量字段，不包含密码、删除时间和角色关联。 */
export class User {
  @ApiProperty({ description: '用户 ID', type: 'integer', example: 1 })
  id!: number;

  @ApiPropertyOptional({
    description: '用户名',
    type: String,
    nullable: true,
    example: 'zhangsan',
  })
  username!: string | null;

  @ApiPropertyOptional({
    description: '昵称',
    type: String,
    nullable: true,
    example: '张三',
  })
  nickname!: string | null;

  @ApiPropertyOptional({
    description: '头像地址',
    type: String,
    nullable: true,
    example: null,
  })
  avatar!: string | null;

  @ApiProperty({
    description: '邮箱',
    format: 'email',
    example: 'user@example.test',
  })
  email!: string;

  @ApiPropertyOptional({
    description: '手机号',
    type: String,
    nullable: true,
    example: null,
  })
  phone!: string | null;

  @ApiPropertyOptional({
    description: '性别：0 未知，1 男，2 女',
    type: 'integer',
    nullable: true,
    example: null,
  })
  sex!: number | null;

  @ApiProperty({
    description: '状态：1 启用，0 禁用',
    type: 'integer',
    example: 1,
  })
  status!: number;

  @ApiPropertyOptional({
    description: '最后登录时间',
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
  })
  lastLoginAt!: Date | null;

  @ApiProperty({
    description: '创建时间',
    type: String,
    format: 'date-time',
    example: '2026-10-23T00:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: '更新时间',
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-10-23T00:00:00.000Z',
  })
  updatedAt!: Date | null;
}
