import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

/** 全量替换角色权限。空数组表示清空。 */
export class ReplaceRolePermissionsDto {
  @ApiProperty({
    description:
      '权限 ID 列表。空数组清空该角色的全部权限，最多 100 个且不能重复',
    type: [Number],
    example: [1, 2],
  })
  @IsArray({ message: '权限列表必须是数组' })
  @ArrayMaxSize(100, { message: '权限列表最多100个' })
  @ArrayUnique({ message: '权限列表不能重复' })
  @IsInt({ each: true, message: '权限 ID 必须是整数' })
  @Min(1, { each: true, message: '权限 ID 必须大于0' })
  @Max(2147483647, { each: true, message: '权限 ID 超出范围' })
  permissionIds!: number[];
}
