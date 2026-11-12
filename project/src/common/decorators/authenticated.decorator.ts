import { SetMetadata } from '@nestjs/common';

export const IS_AUTHENTICATED_KEY = 'isAuthenticated';

/** 已登录即可访问，不再要求具体权限。不能和 Public 或 RequirePermissions 同时使用。 */
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);
