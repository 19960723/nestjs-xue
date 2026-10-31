import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../entities/role.entity.js';

export class RolePageDto {
  @ApiProperty({ description: '当前页角色列表', type: [Role] })
  list!: Role[];

  @ApiProperty({ description: '匹配的角色总数', type: 'integer', example: 1 })
  total!: number;

  @ApiProperty({ description: '当前页码', type: 'integer', example: 1 })
  page!: number;

  @ApiProperty({ description: '每页条数', type: 'integer', example: 10 })
  pageSize!: number;
}
