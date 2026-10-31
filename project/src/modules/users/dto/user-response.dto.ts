import { ApiProperty } from '@nestjs/swagger';
import { User } from '../entities/user.entity.js';

export class UserPageDto {
  @ApiProperty({ description: '当前页用户列表', type: [User] })
  list!: User[];

  @ApiProperty({ description: '匹配的用户总数', type: 'integer', example: 1 })
  total!: number;

  @ApiProperty({ description: '当前页码', type: 'integer', example: 1 })
  page!: number;

  @ApiProperty({ description: '每页条数', type: 'integer', example: 10 })
  pageSize!: number;
}
