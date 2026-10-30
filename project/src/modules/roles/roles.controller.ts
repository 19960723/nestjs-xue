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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RolesService } from './roles.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { QueryRoleDto } from './dto/query-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { DeleteRoleResponseDto, RolePageDto } from './dto/role-response.dto.js';
import { Role } from './entities/role.entity.js';

@ApiTags('角色管理')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: '新增角色' })
  @ApiBody({ type: CreateRoleDto })
  @ApiCreatedResponse({ description: '角色创建成功', type: Role })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiConflictResponse({ description: '角色编码已存在' })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @ApiOperation({
    summary: '分页查询角色',
    description:
      '默认按 sort 升序、id 降序；支持按名称或编码模糊搜索，以及按状态筛选。',
  })
  @ApiOkResponse({ description: '角色分页结果', type: RolePageDto })
  @ApiBadRequestResponse({ description: '分页或筛选参数不符合校验规则' })
  findAll(@Query() query: QueryRoleDto) {
    return this.rolesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '查询角色详情' })
  @ApiParam({ name: 'id', description: '角色 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '角色详情', type: Role })
  @ApiNotFoundResponse({ description: '角色不存在' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改角色' })
  @ApiParam({ name: 'id', description: '角色 ID', type: 'integer', example: 1 })
  @ApiBody({ type: UpdateRoleDto })
  @ApiOkResponse({ description: '修改后的角色', type: Role })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiNotFoundResponse({ description: '角色不存在' })
  @ApiConflictResponse({ description: '角色编码已存在' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除角色',
    description: '尚未分配给用户时物理删除；已分配则返回 409。',
  })
  @ApiParam({ name: 'id', description: '角色 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '角色删除成功', type: DeleteRoleResponseDto })
  @ApiNotFoundResponse({ description: '角色不存在' })
  @ApiConflictResponse({ description: '角色已分配给用户，无法删除' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }
}
