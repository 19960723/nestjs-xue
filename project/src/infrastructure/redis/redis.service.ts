import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

const CONNECT_TIMEOUT_MS = 2000;
const COMMAND_TIMEOUT_MS = 1000;
const QUIT_TIMEOUT_MS = 1000;

/** 固定窗口加一。过期和计数在同一次脚本里完成，避免计数成功后进程退出留下永久键。 */
const CONSUME_WINDOW = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

/**
 * 进程内唯一的 Redis 客户端。
 * 只提供连接生命周期和登录来源的固定窗口计数，不缓存用户、会话或权限。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const client = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number) =>
        times > 20 ? null : Math.min(times * 200, 2000),
    });
    client.on('error', () => {
      this.logger.warn('Redis 连接异常');
    });
    client.on('ready', () => {
      this.logger.log('Redis 连接成功');
    });
    client.on('close', () => {
      this.logger.warn('Redis 连接已关闭');
    });
    this.client = client;
    try {
      await client.connect();
      const reply = await client.ping();
      if (reply !== 'PONG') {
        throw new Error('PING');
      }
    } catch {
      client.disconnect();
      this.client = null;
      throw new Error('Redis 连接失败');
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }
    try {
      await Promise.race([
        client.quit(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('quit timeout')), QUIT_TIMEOUT_MS);
        }),
      ]);
    } catch {
      client.disconnect();
    }
    this.logger.log('Redis 连接已断开');
  }

  /**
   * 占用一个固定窗口的一次计数。键只接受服务端算出的摘要和时间桶，不接受原文地址。
   * Redis 不可用时返回 503，调用方不得继续放行。
   */
  async consumeWindow(
    scope: 'auth:login-ip',
    keyHash: string,
    windowStart: number,
    limit: number,
    windowSeconds: number,
  ): Promise<{ count: number; retryAfter: number }> {
    if (!/^[a-f0-9]{64}$/.test(keyHash)) {
      throw new ServiceUnavailableException('服务暂不可用');
    }
    if (
      !Number.isSafeInteger(windowStart) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      !Number.isInteger(windowSeconds) ||
      windowSeconds < 1
    ) {
      throw new ServiceUnavailableException('服务暂不可用');
    }
    const client = this.client;
    if (!client) {
      throw new ServiceUnavailableException('服务暂不可用');
    }
    const key = `init-xue:${this.config.getOrThrow<string>('NODE_ENV')}:v1:${scope}:${keyHash}:${windowStart}`;
    try {
      const reply: unknown = await client.eval(
        CONSUME_WINDOW,
        1,
        key,
        String(windowSeconds),
      );
      const count = readCount(reply);
      const ttl = readTtl(reply);
      return { count, retryAfter: Math.max(1, ttl) };
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('服务暂不可用');
    }
  }
}

function readCount(reply: unknown): number {
  if (!Array.isArray(reply) || reply.length !== 2) {
    throw new ServiceUnavailableException('服务暂不可用');
  }
  const count = Number(reply[0]);
  if (!Number.isInteger(count) || count < 1) {
    throw new ServiceUnavailableException('服务暂不可用');
  }
  return count;
}

function readTtl(reply: unknown): number {
  if (!Array.isArray(reply)) {
    throw new ServiceUnavailableException('服务暂不可用');
  }
  const ttl = Number(reply[1]);
  if (!Number.isInteger(ttl) || ttl < 1) {
    throw new ServiceUnavailableException('服务暂不可用');
  }
  return ttl;
}
