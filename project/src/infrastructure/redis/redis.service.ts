import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/** 连接 2 秒、命令 1 秒、退出 1 秒。到点就失败，不让请求一直等 Redis。 */
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

/** 展示缓存只允许这一个范围。键由服务内部拼出，不接受调用方传入的任意键。 */
type CacheScope = 'users:profile';

/**
 * 进程内唯一的 Redis 客户端。
 * 提供连接生命周期、登录来源的固定窗口计数，以及用户详情的短时展示缓存。
 * 不缓存会话或权限。展示缓存失败时调用方回源，不因此放行登录。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * 启动时连接并 PING。结果不是 PONG，或连接失败，就抛错，进程不开始监听。
   * 关闭离线排队，避免 Redis 断开后请求一直挂着。日志不带 REDIS_URL。
   */
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

  /** 关闭时最多等 1 秒 quit。超时或失败就直接断开，避免进程退不掉。 */
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

  /**
   * 读取展示缓存。未命中、结构损坏或 Redis 故障都返回 null，调用方改读 MySQL。
   * 损坏的值会删掉，避免一直回放坏数据。
   */
  async readJson(scope: CacheScope, id: number): Promise<unknown | null> {
    const key = this.cacheKey(scope, id);
    const client = this.client;
    if (!key || !client) {
      return null;
    }
    try {
      const raw = await client.get(key);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as unknown;
    } catch {
      this.logger.warn('展示缓存读取失败');
      await this.forget(scope, id);
      return null;
    }
  }

  /**
   * 写入展示缓存。ttlSeconds 必须是 1～3600 的整数，序列化结果不超过 4096 字符。
   * 失败只记日志，不影响已经从 MySQL 读到的资料。
   */
  async writeJson(
    scope: CacheScope,
    id: number,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.cacheKey(scope, id);
    const client = this.client;
    if (!key || !client) {
      return;
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
      this.logger.warn('展示缓存有效期无效');
      return;
    }
    let json: string;
    try {
      const encoded = JSON.stringify(value);
      if (typeof encoded !== 'string' || encoded.length > 4096) {
        this.logger.warn('展示缓存值无效');
        return;
      }
      json = encoded;
    } catch {
      this.logger.warn('展示缓存值无效');
      return;
    }
    try {
      await client.set(key, json, 'EX', ttlSeconds);
    } catch {
      this.logger.warn('展示缓存写入失败');
    }
  }

  /** 删除展示缓存。失败只记日志，已提交的数据不回滚，剩下的值靠有效期消失。 */
  async forget(scope: CacheScope, id: number): Promise<void> {
    const key = this.cacheKey(scope, id);
    const client = this.client;
    if (!key || !client) {
      return;
    }
    try {
      await client.del(key);
    } catch {
      this.logger.warn('展示缓存删除失败');
    }
  }

  /** 键只含环境、范围和整数 id。id 不是 1～2147483647 时不访问 Redis。 */
  private cacheKey(scope: CacheScope, id: number): string | null {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
      return null;
    }
    return `init-xue:${this.config.getOrThrow<string>('NODE_ENV')}:v1:${scope}:${id}`;
  }
}

/** 脚本返回值不可信。计数和剩余时间都不是正整数时，登录按 Redis 不可用处理。 */
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
