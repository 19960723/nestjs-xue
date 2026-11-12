import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { User } from './entities/user.entity.js';
import { UserPageDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { SetInitialPasswordDto } from './dto/set-initial-password.dto.js';

/**
 * 用户 HTTP 入口。只做路由和文档，业务规则在 UsersService。
 * 有效 Access 之外，每个路由还要具备对应权限。
 */
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '身份无效' })
@ApiForbiddenResponse({ description: '权限不足' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('users:create')
  @ApiOperation({ summary: '新增用户' })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ description: '用户创建成功', type: User })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiConflictResponse({ description: '邮箱已被使用' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({
    summary: '分页查询用户',
    description: '按 ID 降序排列，支持按姓名或邮箱模糊搜索。',
  })
  @ApiOkResponse({ description: '用户分页结果', type: UserPageDto })
  @ApiBadRequestResponse({ description: '分页或搜索参数不符合校验规则' })
  findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Post(':id/password')
  @RequirePermissions('users:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '首次设置密码',
    description:
      '仅当密码为空、用户未删除且为启用状态时写入密码哈希。响应不包含密码。调用前需要有效 Access。',
  })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiBody({ type: SetInitialPasswordDto })
  @ApiOkResponse({ description: '密码已设置后的用户资料', type: User })
  @ApiBadRequestResponse({ description: '密码不符合校验规则' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  @ApiConflictResponse({ description: '用户已禁用或密码已设置' })
  setInitialPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetInitialPasswordDto,
  ) {
    return this.usersService.setInitialPassword(id, dto.password);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: '查询用户详情' })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '用户详情', type: User })
  @ApiNotFoundResponse({ description: '用户不存在' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  @ApiOperation({ summary: '修改用户资料' })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ description: '修改后的用户资料', type: User })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  @ApiConflictResponse({ description: '邮箱已被使用' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  @ApiOperation({
    summary: '删除用户',
    description: '尚未分配角色时物理删除；已分配则返回 409。',
  })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '用户删除成功，data 为 null' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  @ApiConflictResponse({ description: '用户已分配角色，无法删除' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
