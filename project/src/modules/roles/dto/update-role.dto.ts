import { PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto.js';

/** 部分更新角色。null 不会被跳过，字段规则与创建相同。 */
export class UpdateRoleDto extends PartialType(CreateRoleDto, {
  skipNullProperties: false,
}) {}
