import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 修改密码入参。新旧密码都保留首尾空格且不截断，避免改掉用户实际输入。
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: '原密码。保留首尾空格，长度 15～128',
    minLength: 15,
    maxLength: 128,
    format: 'password',
  })
  @IsString({ message: '原密码必须是字符串' })
  @MinLength(15, { message: '原密码不能少于15个字符' })
  @MaxLength(128, { message: '原密码不能超过128个字符' })
  oldPassword!: string;

  @ApiProperty({
    description: '新密码。保留首尾空格，长度 15～128',
    minLength: 15,
    maxLength: 128,
    format: 'password',
  })
  @IsString({ message: '新密码必须是字符串' })
  @MinLength(15, { message: '新密码不能少于15个字符' })
  @MaxLength(128, { message: '新密码不能超过128个字符' })
  newPassword!: string;
}
