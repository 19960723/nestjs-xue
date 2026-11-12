import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { AuthorizationService } from './authorization.service.js';
import { PermissionView } from './entities/permission.entity.js';

/** 权限目录只读。新增权限走种子，不在这里提供写接口。 */
@ApiTags('权限目录')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '身份无效' })
@ApiForbiddenResponse({ description: '权限不足' })
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get()
  @RequirePermissions('permissions:read')
  @ApiOperation({
    summary: '查询权限目录',
    description: '返回全部权限，按权限码排序。目录由种子维护。',
  })
  @ApiOkResponse({ description: '权限目录', type: [PermissionView] })
  list() {
    return this.authorization.listPermissions();
  }
}
