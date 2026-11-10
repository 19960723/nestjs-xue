import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标记路由跳过 Access Guard。预定只用于健康检查和登录。
 * 当前还没有路由使用它，Guard 也尚未全局注册。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
