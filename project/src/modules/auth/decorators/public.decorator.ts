import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记路由跳过身份和权限校验。只用于健康检查、登录和刷新。 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
