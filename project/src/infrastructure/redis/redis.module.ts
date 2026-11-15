import { Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

/**
 * Redis 模块。只导出这一个服务，业务模块不直接创建客户端。
 */
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
