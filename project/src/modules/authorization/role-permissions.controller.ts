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
import { AuthorizationService } from './authorization.service.js';
import { ReplaceRolePermissionsDto } from './dto/replace-role-permissions.dto.js';
import { PermissionView } from './entities/permission.entity.js';

/** 角色与权限的关联。替换是全量操作，不能给自己没有的权限。 */
@ApiTags('角色管理')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '身份无效' })
@ApiForbiddenResponse({ description: '权限不足' })
@Controller('roles')
export class RolePermissionsController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get(':id/permissions')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: '查询角色权限' })
  @ApiParam({ name: 'id', description: '角色 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '角色当前权限', type: [PermissionView] })
  @ApiNotFoundResponse({ description: '角色不存在' })
  list(@Param('id', ParseIntPipe) id: number) {
    return this.authorization.listRolePermissions(id);
  }

  @Put(':id/permissions')
  @RequirePermissions('roles:write')
  @ApiOperation({
    summary: '替换角色权限',
    description:
      '用请求中的权限 ID 全量替换。空数组清空。系统角色的权限只能由种子修改。',
  })
  @ApiParam({ name: 'id', description: '角色 ID', type: 'integer', example: 1 })
  @ApiBody({ type: ReplaceRolePermissionsDto })
  @ApiOkResponse({ description: '替换后的权限', type: [PermissionView] })
  @ApiNotFoundResponse({ description: '角色或权限不存在' })
  @ApiConflictResponse({ description: '系统角色的权限不能通过接口修改' })
  replace(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceRolePermissionsDto,
  ) {
    return this.authorization.replaceRolePermissions(
      actor.id,
      id,
      dto.permissionIds,
    );
  }
}
