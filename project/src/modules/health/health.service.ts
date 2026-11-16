import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

/**
 * 就绪检查。MySQL 和 Redis 都是登录限流所必需的依赖。
 * 只执行 SELECT 1 和 PING，不读业务表，响应里不写地址或失败原因。
 */
@Injectable()
export class HealthService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(HealthService.name);
  private closing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 进程开始关闭时先标未就绪，避免关闭途中仍被当成可接流量。 */
  beforeApplicationShutdown(): void {
    this.closing = true;
  }

  async ready(): Promise<{ status: 'ok' }> {
    if (this.closing) {
      throw new ServiceUnavailableException('服务暂不可用');
    }
    const [database, cache] = await Promise.all([
      this.databaseReady(),
      this.redis.ping(),
    ]);
    if (!database || !cache) {
      throw new ServiceUnavailableException('服务暂不可用');
    }
    return { status: 'ok' };
  }

  /** 查询本身限制 1 秒。失败只记日志，不把数据库错误交给探针。 */
  private async databaseReady(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ ok: number | bigint }>>`
        SELECT /*+ MAX_EXECUTION_TIME(1000) */ 1 AS ok
      `;
      const ok = rows[0]?.ok;
      return ok === 1 || ok === 1n;
    } catch {
      this.logger.warn('数据库就绪检查失败');
      return false;
    }
  }
}
