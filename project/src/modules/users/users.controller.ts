import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
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
import { User } from './entities/user.entity.js';
import { DeleteUserResponseDto, UserPageDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '新增用户' })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ description: '用户创建成功', type: User })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiConflictResponse({ description: '邮箱已被使用' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({
    summary: '分页查询用户',
    description: '按 ID 降序排列，支持按姓名或邮箱模糊搜索。',
  })
  @ApiOkResponse({ description: '用户分页结果', type: UserPageDto })
  @ApiBadRequestResponse({ description: '分页或搜索参数不符合校验规则' })
  findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '查询用户详情' })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '用户详情', type: User })
  @ApiNotFoundResponse({ description: '用户不存在' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改用户资料' })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ description: '修改后的用户资料', type: User })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  @ApiConflictResponse({ description: '邮箱已被使用' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除用户',
    description: '当前执行物理删除，并返回删除结果消息。',
  })
  @ApiParam({ name: 'id', description: '用户 ID', type: 'integer', example: 1 })
  @ApiOkResponse({ description: '用户删除成功', type: DeleteUserResponseDto })
  @ApiNotFoundResponse({ description: '用户不存在' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}
