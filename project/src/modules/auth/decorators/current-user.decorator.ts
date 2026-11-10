import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

/**
 * 读取 Guard 写入的当前用户。没有身份时返回 401，不把未认证请求当成匿名继续执行。
 * Guard 尚未全局注册时，这里还取不到用户。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException('身份无效');
    }
    return request.user;
  },
);
