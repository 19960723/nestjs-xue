import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { CleanupService } from './cleanup.service.js';

/**
 * 过期数据清理。默认不注册定时器。
 * 清理服务始终可被直接调用，方便按给定时间执行一次。
 */
@Module({})
export class MaintenanceModule {
  static async register(enabled: boolean): Promise<DynamicModule> {
    const providers: Provider[] = [CleanupService];
    const imports: DynamicModule[] = [];
    if (enabled) {
      const { ScheduleModule } = await import('@nestjs/schedule');
      const { CleanupSchedule } = await import('./cleanup.schedule.js');
      imports.push(ScheduleModule.forRoot());
      providers.push(CleanupSchedule);
    }
    return {
      module: MaintenanceModule,
      imports,
      providers,
      exports: [CleanupService],
    };
  }
}
