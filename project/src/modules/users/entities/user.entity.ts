import { ApiProperty } from '@nestjs/swagger';

/** 当前接口返回的用户标量字段，不包含未加载的角色关联。 */
export class User {
  @ApiProperty({ description: '用户 ID', type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ description: '姓名', maxLength: 50, example: '张三' })
  name!: string;

  @ApiProperty({
    description: '邮箱',
    format: 'email',
    example: 'user@example.test',
  })
  email!: string;

  @ApiProperty({
    description: '年龄',
    type: 'integer',
    nullable: true,
    example: 28,
  })
  age!: number | null;

  @ApiProperty({
    description: '状态：1 启用，0 禁用',
    type: 'integer',
    example: 1,
  })
  status!: number;

  @ApiProperty({
    description: '手机号',
    type: String,
    nullable: true,
    example: null,
  })
  phone!: string | null;

  @ApiProperty({
    description: '性别：0 未知，1 男，2 女',
    type: 'integer',
    nullable: true,
    example: null,
  })
  sex!: number | null;

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
    example: '2026-10-23T00:00:00.000Z',
  })
  updatedAt!: Date;
}
