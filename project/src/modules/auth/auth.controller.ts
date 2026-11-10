import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { User } from '../users/entities/user.entity.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { TokenSetDto } from './dto/token-set.dto.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

/**
 * 登录和当前用户入口。凭据、会话和资料查询在 AuthService。
 * 登录响应禁止缓存。当前没有刷新接口。
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 唯一公开的认证入口。成功体由统一包装输出。 */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '登录',
    description:
      '使用用户名和密码登录。没有用户名、尚未设密、已禁用或已删除的用户都返回同一条 401。不提供刷新接口。',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: '登录成功', type: TokenSetDto })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiUnauthorizedResponse({ description: '用户名或密码错误' })
  login(@Body() dto: LoginDto): Promise<TokenSetDto> {
    return this.authService.login(dto.username, dto.password);
  }

  /** 用当前 Access 读取公开资料。没有有效身份时由 Guard 返回 401。 */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '当前用户',
    description: '需要有效 Access。返回公开资料，不包含密码。',
  })
  @ApiOkResponse({ description: '当前用户公开资料', type: User })
  @ApiUnauthorizedResponse({ description: '身份无效' })
  @ApiServiceUnavailableResponse({ description: '数据库不可用' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.currentUser(user.id);
  }
}
