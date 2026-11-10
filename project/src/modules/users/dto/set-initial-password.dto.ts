import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** 首次设置的密码。保留首尾空格，不在 DTO 层截断或改写。 */
export class SetInitialPasswordDto {
  @ApiProperty({
    description: '首次设置的密码。保留首尾空格，长度 15～128',
    minLength: 15,
    maxLength: 128,
    format: 'password',
  })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(15, { message: '密码不能少于15个字符' })
  @MaxLength(128, { message: '密码不能超过128个字符' })
  password!: string;
}
