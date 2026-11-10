import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 跳过全局 Access Guard。只用于健康检查和登录。 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
