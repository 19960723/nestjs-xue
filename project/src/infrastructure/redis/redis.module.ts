import { Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service.js';
import { RedisService } from './redis.service.js';

/**
 * Redis 模块。只导出这一个客户端和全局限流。
 * 业务模块不直接创建客户端。
 */
@Module({
  providers: [RedisService, RateLimitService],
  exports: [RedisService, RateLimitService],
})
export class RedisModule {}
