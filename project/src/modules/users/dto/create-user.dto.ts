import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: '邮箱',
    format: 'email',
    maxLength: 100,
    example: 'user@example.test',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: '邮箱必须是字符串' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(100, { message: '邮箱不能超过100个字符' })
  email!: string;

  @ApiPropertyOptional({
    description: '用户名',
    type: String,
    minLength: 1,
    maxLength: 50,
    nullable: true,
    example: 'zhangsan',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: '用户名必须是字符串' })
  @MinLength(1, { message: '用户名不能为空' })
  @MaxLength(50, { message: '用户名不能超过50个字符' })
  username?: string | null;

  @ApiPropertyOptional({
    description: '昵称',
    type: String,
    minLength: 1,
    maxLength: 50,
    nullable: true,
    example: '张三',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MinLength(1, { message: '昵称不能为空' })
  @MaxLength(50, { message: '昵称不能超过50个字符' })
  nickname?: string | null;

  @ApiPropertyOptional({
    description: '手机号',
    type: String,
    maxLength: 20,
    nullable: true,
    example: '13800000000',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: '手机号必须是字符串' })
  @MinLength(1, { message: '手机号不能为空' })
  @MaxLength(20, { message: '手机号不能超过20个字符' })
  phone?: string | null;

  @ApiPropertyOptional({
    description: '性别：0 未知，1 男，2 女',
    type: 'integer',
    enum: [0, 1, 2],
    nullable: true,
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: '性别必须是整数' })
  @IsIn([0, 1, 2], { message: '性别只能为0、1或2' })
  sex?: number | null;

  @ApiPropertyOptional({
    description: '头像地址',
    type: String,
    maxLength: 255,
    nullable: true,
    example: null,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: '头像地址必须是字符串' })
  @MinLength(1, { message: '头像地址不能为空' })
  @MaxLength(255, { message: '头像地址不能超过255个字符' })
  avatar?: string | null;
}
