import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { TokenSetDto } from './dto/token-set.dto.js';

/**
 * 登录入口。只负责路由、状态码和缓存头，凭据与会话规则在 AuthService。
 * no-store 避免令牌被中间层缓存。当前没有刷新接口。
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  /** 校验交给全局 Pipe，成功体由统一包装输出。 */
  login(@Body() dto: LoginDto): Promise<TokenSetDto> {
    return this.authService.login(dto.username, dto.password);
  }
}
