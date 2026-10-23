import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: '姓名',
    minLength: 1,
    maxLength: 50,
    example: '张三',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @ApiProperty({
    description: '邮箱',
    format: 'email',
    example: 'user@example.test',
  })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description: '年龄',
    type: 'integer',
    minimum: 0,
    maximum: 150,
    nullable: true,
    example: 28,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;
}
