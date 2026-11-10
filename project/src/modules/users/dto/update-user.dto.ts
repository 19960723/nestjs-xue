import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto.js';

/** 部分更新资料。null 不会被跳过，邮箱为 null 时由 Service 拒绝。 */
export class UpdateUserDto extends PartialType(CreateUserDto, {
  skipNullProperties: false,
}) {}
