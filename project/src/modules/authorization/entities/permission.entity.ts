import { ApiProperty } from '@nestjs/swagger';

/** 权限目录的公开字段。 */
export class PermissionView {
  @ApiProperty({ description: '权限 ID', type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ description: '权限名称', example: '查看用户' })
  name!: string;

  @ApiProperty({ description: '权限码', example: 'users:read' })
  code!: string;

  @ApiProperty({
    description: '权限类型',
    enum: ['DIRECTORY', 'MENU', 'BUTTON', 'API'],
    example: 'API',
  })
  type!: string;

  @ApiProperty({
    description: '状态：0=禁用，1=启用',
    type: 'integer',
    enum: [0, 1],
    example: 1,
  })
  status!: number;
}
