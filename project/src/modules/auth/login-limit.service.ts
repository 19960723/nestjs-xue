import { createHmac } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client.js';
import { AttemptLimitedException } from '../../common/exceptions/attempt-limited.exception.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { isDatabaseError } from './database-error.js';

interface AttemptWindow {
  keyHash: string;
  windowStart: Date;
  expiresAt: Date;
  retryAfter: number;
  maxAttempts: number;
}

/**
 * 登录前占用固定窗口次数。账号和来源地址各一个桶，键是 HMAC，不保存原文。
 * 次数在密码哈希之前增加并提交。超过上限返回 429，成功登录也不把次数减回去。
 * 数据库故障返回 503，不继续核对密码。
 */
@Injectable()
export class LoginLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async reserve(username: string, ip: string): Promise<void> {
    const now = new Date();
    const account = this.windowFor(
      'a:',
      username,
      now,
      this.config.getOrThrow<number>('AUTH_ACCOUNT_WINDOW_SECONDS'),
      this.config.getOrThrow<number>('AUTH_ACCOUNT_MAX_ATTEMPTS'),
    );
    const source = this.windowFor(
      'i:',
      normalizeIp(ip),
      now,
      this.config.getOrThrow<number>('AUTH_IP_WINDOW_SECONDS'),
      this.config.getOrThrow<number>('AUTH_IP_MAX_ATTEMPTS'),
    );

    try {
      const usage = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          DELETE FROM auth_attempt_buckets
          WHERE expires_at <= ${now}
          LIMIT 100
        `;
        return {
          account: await this.increment(tx, account),
          source: await this.increment(tx, source),
        };
      });
      const retryAfter = exceededRetry(
        account,
        usage.account,
        source,
        usage.source,
      );
      if (retryAfter !== null) {
        throw new AttemptLimitedException(retryAfter);
      }
    } catch (error: unknown) {
      if (error instanceof AttemptLimitedException) {
        throw error;
      }
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }

  private windowFor(
    prefix: string,
    value: string,
    now: Date,
    windowSeconds: number,
    maxAttempts: number,
  ): AttemptWindow {
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const aligned = nowSeconds - (nowSeconds % windowSeconds);
    const secret = this.config.getOrThrow<string>('AUTH_LIMIT_HMAC_SECRET');
    return {
      keyHash: createHmac('sha256', secret)
        .update(`${prefix}${value}`)
        .digest('hex'),
      windowStart: new Date(aligned * 1000),
      expiresAt: new Date((aligned + windowSeconds) * 1000),
      retryAfter: Math.max(1, aligned + windowSeconds - nowSeconds),
      maxAttempts,
    };
  }

  /** 同一窗口的并发增加由数据库行锁串行化，读到的是增加之后的次数。 */
  private async increment(
    tx: Prisma.TransactionClient,
    bucket: AttemptWindow,
  ): Promise<number> {
    await tx.$executeRaw`
      INSERT INTO auth_attempt_buckets (key_hash, window_start, attempts, expires_at)
      VALUES (${bucket.keyHash}, ${bucket.windowStart}, 1, ${bucket.expiresAt})
      ON DUPLICATE KEY UPDATE attempts = attempts + 1
    `;
    const rows = await tx.$queryRaw<Array<{ attempts: number | bigint }>>`
      SELECT attempts FROM auth_attempt_buckets
      WHERE key_hash = ${bucket.keyHash} AND window_start = ${bucket.windowStart}
    `;
    const attempts = rows[0]?.attempts;
    if (typeof attempts !== 'number' && typeof attempts !== 'bigint') {
      throw new Error('登录计数缺失');
    }
    return Number(attempts);
  }
}

function exceededRetry(
  account: AttemptWindow,
  accountAttempts: number,
  source: AttemptWindow,
  sourceAttempts: number,
): number | null {
  const waits = [
    accountAttempts > account.maxAttempts ? account.retryAfter : 0,
    sourceAttempts > source.maxAttempts ? source.retryAfter : 0,
  ];
  const retryAfter = Math.max(...waits);
  return retryAfter > 0 ? retryAfter : null;
}

/** 只使用直接连接地址。去掉 IPv4 映射前缀，过长或空白归入同一个未知桶。 */
function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  const mapped = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  if (mapped.length === 0 || mapped.length > 45) {
    return 'unknown';
  }
  return mapped;
}
