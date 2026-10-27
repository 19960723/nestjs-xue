import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    description: '角色名称',
    minLength: 1,
    maxLength: 50,
    example: '管理员',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: '角色名称必须是字符串' })
  @IsNotEmpty({ message: '角色名称不能为空' })
  @MaxLength(50, { message: '角色名称不能超过50个字符' })
  name!: string;

  @ApiProperty({
    description: '角色编码，以字母开头，仅包含字母、数字、下划线或连字符',
    minLength: 2,
    maxLength: 50,
    pattern: '^[A-Za-z][A-Za-z0-9_-]{1,49}$',
    example: 'ADMIN',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: '角色编码必须是字符串' })
  @MinLength(2, { message: '角色编码不能少于2个字符' })
  @MaxLength(50, { message: '角色编码不能超过50个字符' })
  @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,49}$/, {
    message: '角色编码必须以字母开头，且只能包含字母、数字、下划线或连字符',
  })
  code!: string;

  @ApiPropertyOptional({
    description: '角色描述',
    type: String,
    maxLength: 255,
    nullable: true,
    example: '系统管理员角色',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: '角色描述必须是字符串' })
  @MaxLength(255, { message: '角色描述不能超过255个字符' })
  description?: string | null;

  @ApiPropertyOptional({
    description: '角色状态：0=禁用，1=启用',
    type: 'integer',
    enum: [0, 1],
    default: 1,
    example: 1,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt({ message: '角色状态必须是整数' })
  @IsIn([0, 1], { message: '角色状态只能为0或1' })
  status?: number;

  @ApiPropertyOptional({
    description: '排序值，非负整数',
    type: 'integer',
    minimum: 0,
    maximum: 2147483647,
    default: 0,
    example: 0,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt({ message: '排序值必须是整数' })
  @Min(0, { message: '排序值不能小于0' })
  @Max(2147483647, { message: '排序值不能超过2147483647' })
  sort?: number;
}
