import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeJsonLog } from '../../common/logging/json-logger.js';
import { currentRequestId } from '../../common/request-context.service.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';

export interface CleanupResult {
  buckets: number;
  sessions: number;
  skipped: boolean;
}

/**
 * 删除已到期的登录计数，以及超过绝对寿命的会话。
 * 每次最多 500 行。空闲到期或已撤销但未到绝对寿命的会话保留，刷新记录随会话保留，用来识别重放。
 * 数据库失败只记日志，不抛出，避免定时器把进程打停。
 */
@Injectable()
export class CleanupService {
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run(now: Date): Promise<CleanupResult> {
    if (this.running) {
      this.log('跳过', 0);
      return { buckets: 0, sessions: 0, skipped: true };
    }

    this.running = true;
    const started = Date.now();
    let buckets = 0;
    let sessions = 0;
    let failed = false;
    try {
      try {
        buckets = this.count(await this.deleteBuckets(now));
      } catch {
        failed = true;
      }
      try {
        sessions = this.count(await this.deleteSessions(now));
      } catch {
        failed = true;
      }
      this.log(
        failed ? '清理失败' : `buckets=${buckets} sessions=${sessions}`,
        Date.now() - started,
      );
      return { buckets, sessions, skipped: false };
    } finally {
      this.running = false;
    }
  }

  /** 登录计数窗口结束后即可删除。库里只有 HMAC，没有用户名或地址。 */
  private async deleteBuckets(now: Date): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM auth_attempt_buckets
      WHERE expires_at <= ${now}
      ORDER BY expires_at, key_hash
      LIMIT 500
    `;
  }

  /**
   * 绝对寿命从会话创建时刻起算，刷新不能把它往后推。
   * 删除会话时，数据库会级联删除它的刷新记录。
   */
  private async deleteSessions(now: Date): Promise<number> {
    const sessionMax = this.config.getOrThrow<number>(
      'SESSION_MAX_TTL_SECONDS',
    );
    const cutoff = new Date(now.getTime() - sessionMax * 1000);
    return this.prisma.$executeRaw`
      DELETE FROM sys_user_session
      WHERE created_at <= ${cutoff}
      ORDER BY id
      LIMIT 500
    `;
  }

  private count(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return 0;
  }

  private log(message: string, duration: number): void {
    writeJsonLog({
      time: new Date().toISOString(),
      level: message === '清理失败' ? 'warn' : 'log',
      context: 'Maintenance',
      requestId: currentRequestId(),
      event: 'maintenance.cleanup',
      message,
      duration,
    });
  }
}
