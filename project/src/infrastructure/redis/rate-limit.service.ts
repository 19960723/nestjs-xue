import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttemptLimitedException } from '../../common/exceptions/attempt-limited.exception.js';
import { normalizeClientAddress } from '../../common/http/client-address.js';
import { RedisService } from './redis.service.js';

/**
 * 按套接字地址占用全局限流。同一环境、同一额度和同一窗口的进程共享 Redis 计数。
 * 超过上限返回 429，并带当前窗口剩余秒数。Redis 不可用时由客户端抛 503，这里不放行。
 * 不保存地址原文，也不读取调用方传来的转发头。
 */
@Injectable()
export class RateLimitService {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async consume(ip: string): Promise<void> {
    const windowSeconds = this.config.getOrThrow<number>(
      'RATE_LIMIT_WINDOW_SECONDS',
    );
    const limit = this.config.getOrThrow<number>('RATE_LIMIT_MAX');
    const nowSeconds = Math.floor(Date.now() / 1000);
    const aligned = nowSeconds - (nowSeconds % windowSeconds);
    const secret = this.config.getOrThrow<string>('AUTH_LIMIT_HMAC_SECRET');
    const keyHash = createHmac('sha256', secret)
      .update(`g:${normalizeClientAddress(ip)}`)
      .digest('hex');
    const shared = await this.redis.consumeWindow(
      'http:global',
      keyHash,
      aligned,
      limit,
      windowSeconds,
    );
    if (shared.count > limit) {
      throw new AttemptLimitedException(shared.retryAfter);
    }
  }
}
