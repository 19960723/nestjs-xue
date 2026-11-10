import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 登录入参。用户名去掉首尾空格；密码保留空格且不截断，避免改掉用户实际输入。
 */
export class LoginDto {
  @ApiProperty({
    description: '用户名。去掉首尾空格，长度 1～50',
    minLength: 1,
    maxLength: 50,
    example: 'zhangsan',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(50, { message: '用户名不能超过50个字符' })
  username!: string;

  @ApiProperty({
    description: '密码。保留首尾空格，长度 15～128',
    minLength: 15,
    maxLength: 128,
    format: 'password',
  })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(15, { message: '密码不能少于15个字符' })
  @MaxLength(128, { message: '密码不能超过128个字符' })
  password!: string;
}
