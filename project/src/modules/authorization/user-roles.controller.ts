import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { Role } from '../roles/entities/role.entity.js';
import { AuthorizationService } from './authorization.service.js';
import { ReplaceUserRolesDto } from './dto/replace-user-roles.dto.js';

/** 用户与角色的关联。不能修改自己的角色，也不能拿掉最后一名有效管理员。 */
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '身份无效' })
@ApiForbiddenResponse({ description: '权限不足或不能修改自己的角色' })
@Controller('users')
export class UserRolesController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get(':id/roles')
  @RequirePermissions('users:assign-roles')
  @ApiOperation({ summary: '查询用户角色' })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '用户当前角色', type: [Role] })
  @ApiNotFoundResponse({ description: '用户不存在' })
  list(@Param('id', ParseIntPipe) id: number) {
    return this.authorization.listUserRoles(id);
  }

  @Put(':id/roles')
  @RequirePermissions('users:assign-roles')
  @ApiOperation({
    summary: '替换用户角色',
    description:
      '用请求中的角色 ID 全量替换。空数组清空。不能修改自己，也不能移除最后一名有效管理员。',
  })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiBody({ type: ReplaceUserRolesDto })
  @ApiOkResponse({ description: '替换后的角色', type: [Role] })
  @ApiNotFoundResponse({ description: '用户或角色不存在' })
  @ApiConflictResponse({
    description: '用户已禁用，或必须保留至少一名有效管理员',
  })
  replace(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceUserRolesDto,
  ) {
    return this.authorization.replaceUserRoles(actor.id, id, dto.roleIds);
  }
}
