import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CleanupService } from './cleanup.service.js';

/**
 * 每小时整点（UTC）清理一批过期数据。
 * 只有 SCHEDULE_ENABLED=true 时才会注册。上一批未结束时由清理服务跳过。
 */
@Injectable()
export class CleanupSchedule {
  constructor(private readonly cleanup: CleanupService) {}

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'UTC' })
  async handle(): Promise<void> {
    await this.cleanup.run(new Date());
  }
}
