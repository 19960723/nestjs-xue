import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/** 探针模块。Redis 只用于 PING，不在这里读写缓存或限流计数。 */
@Module({
  imports: [RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
