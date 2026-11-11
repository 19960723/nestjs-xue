import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { User } from '../users/entities/user.entity.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { TokenSetDto } from './dto/token-set.dto.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

/**
 * 登录、刷新、退出、改密和当前用户入口。凭据与会话处理在 AuthService。
 * 含令牌的响应禁止缓存。刷新不使用 Access，旧 Refresh 只能成功一次。
 * 退出当前会话不影响其它登录；全部退出和改密会使该用户的旧凭据失效。
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 公开的登录入口。成功体由统一包装输出。 */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '登录',
    description:
      '使用用户名和密码登录。没有用户名、尚未设密、已禁用或已删除的用户都返回同一条 401。同一用户名 15 分钟内最多 10 次尝试，同一来源地址每分钟最多 60 次。',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: '登录成功', type: TokenSetDto })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiUnauthorizedResponse({ description: '用户名或密码错误' })
  @ApiTooManyRequestsResponse({ description: '尝试过于频繁' })
  @ApiServiceUnavailableResponse({ description: '数据库不可用' })
  login(@Req() request: Request, @Body() dto: LoginDto): Promise<TokenSetDto> {
    const address = request.socket?.remoteAddress;
    return this.authService.login(
      dto.username,
      dto.password,
      typeof address === 'string' ? address : 'unknown',
    );
  }

  /**
   * 公开路由，但必须带尚未使用的 Refresh。
   * 重放会撤销整段会话，因此不能并行调用。
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '刷新',
    description:
      '用一次性 Refresh 换取新的 Access 和 Refresh。旧凭据再次使用会撤销整段会话。未知、过期和已撤销都返回同一条 401。',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: '刷新成功', type: TokenSetDto })
  @ApiBadRequestResponse({ description: '刷新凭据格式不正确' })
  @ApiUnauthorizedResponse({ description: '身份无效' })
  @ApiServiceUnavailableResponse({ description: '数据库不可用' })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenSetDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  /** 撤销当前 Access 对应的会话。成功后这张 Access 和配套 Refresh 不能再使用。 */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '退出当前会话',
    description:
      '需要有效 Access。只撤销当前会话，其它登录保持有效。再次使用这张 Access 返回 401。',
  })
  @ApiOkResponse({ description: '当前会话已撤销' })
  @ApiUnauthorizedResponse({ description: '身份无效' })
  @ApiServiceUnavailableResponse({ description: '数据库不可用' })
  logout(@CurrentUser() user: AuthenticatedUser): Promise<null> {
    return this.authService.logout(user.sessionId);
  }

  /** 提升 tokenVersion 并撤销该用户全部会话。调用方需要重新登录。 */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '退出全部会话',
    description:
      '需要有效 Access。撤销该用户的全部会话，已发出的 Access 和 Refresh 都会失效。',
  })
  @ApiOkResponse({ description: '全部会话已撤销' })
  @ApiUnauthorizedResponse({ description: '身份无效' })
  @ApiServiceUnavailableResponse({ description: '数据库不可用' })
  logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<null> {
    return this.authService.logoutAll(user.id);
  }

  /**
   * 核对原密码后更换。成功会使全部旧 Access 和 Refresh 失效，需要重新登录。
   * 响应不返回密码或哈希。
   */
  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '修改密码',
    description:
      '需要有效 Access 和原密码。成功后撤销全部会话。原密码错误返回 401，并发修改返回 409。',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ description: '密码已更新，全部会话已撤销' })
  @ApiBadRequestResponse({ description: '请求字段不符合校验规则' })
  @ApiUnauthorizedResponse({ description: '原密码错误' })
  @ApiConflictResponse({ description: '密码已变更' })
  @ApiServiceUnavailableResponse({ description: '数据库不可用' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<null> {
    return this.authService.changePassword(
      user.id,
      dto.oldPassword,
      dto.newPassword,
    );
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
