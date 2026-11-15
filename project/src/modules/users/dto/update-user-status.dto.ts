import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';

/** 启用或停用用户。资料接口不接收这个字段。 */
export class UpdateUserStatusDto {
  @ApiProperty({
    description: '用户状态：0=停用，1=启用',
    type: 'integer',
    enum: [0, 1],
    example: 0,
  })
  @IsInt({ message: '用户状态必须是整数' })
  @IsIn([0, 1], { message: '用户状态只能为0或1' })
  status!: number;
}
