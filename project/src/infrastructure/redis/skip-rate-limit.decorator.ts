import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/** 跳过全局限流。只给存活探针，避免 Redis 断开时它也被挡成 503。 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
