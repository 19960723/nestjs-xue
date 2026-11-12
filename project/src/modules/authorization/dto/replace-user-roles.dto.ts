import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

/** 全量替换用户角色。空数组表示清空。 */
export class ReplaceUserRolesDto {
  @ApiProperty({
    description:
      '角色 ID 列表。空数组清空该用户的全部角色，最多 100 个且不能重复',
    type: [Number],
    example: [1],
  })
  @IsArray({ message: '角色列表必须是数组' })
  @ArrayMaxSize(100, { message: '角色列表最多100个' })
  @ArrayUnique({ message: '角色列表不能重复' })
  @IsInt({ each: true, message: '角色 ID 必须是整数' })
  @Min(1, { each: true, message: '角色 ID 必须大于0' })
  @Max(2147483647, { each: true, message: '角色 ID 超出范围' })
  roleIds!: number[];
}
