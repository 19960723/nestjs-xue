import { Module } from '@nestjs/common';
import type { DynamicModule, NestApplicationOptions } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LOG_LEVELS, validateEnv } from './config/env.validation.js';
import type { Environment } from './config/env.validation.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

// 固定的模块依赖在此声明；环境配置与可选 Observe 由下方工厂按需加入。
@Module({
  imports: [HealthModule, PrismaModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

/** main 与 E2E 共用的组装入口，返回根模块及配套的 Nest 启动选项。 */
export async function createAppModule(): Promise<{
  appModule: DynamicModule;
  appOptions: NestApplicationOptions;
}> {
  let environment: Environment | undefined;
  const configModule = await ConfigModule.forRoot({
    isGlobal: true,
    // NODE_ENV 由启动环境指定；生产和测试均不加载工作目录的个人 .env。
    ignoreEnvFile:
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test',
    // 配置读取只使用加载/校验后的值，关闭对原始 process.env 的回退。
    skipProcessEnv: true,
    validate: (raw: Record<string, unknown>) => {
      environment = validateEnv(raw);
      return environment;
    },
  });
  // 后续的开关判断、凭据使用和日志设置都依赖 validate 已执行。
  if (!environment) throw new Error('环境配置未完成校验');

  const appModule: DynamicModule = {
    module: AppModule,
    imports: [configModule],
  };
  const appOptions: NestApplicationOptions = {
    // LOG_LEVELS 按严重程度排列：保留所选级别及更严重的日志。
    logger: LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(environment.LOG_LEVEL) + 1),
  };
  if (environment.OBSERVE_ENABLED) {
    // 校验通过且显式开启后才加载 SDK，默认启动不产生 Observe 初始化副作用。
    const { createObserveModule } = await import('@nestjs/observe');
    const { ObserveModule, ObserveInstrument } = createObserveModule();
    appModule.imports?.push(
      ObserveModule.forRoot({
        // validateEnv 已保证开启时两项凭据均存在，因此这里使用非空断言。
        appKey: environment.OBSERVE_APP_KEY!,
        appSecret: environment.OBSERVE_APP_SECRET!,
        runtimeMetrics: !process.versions['webcontainer'],
        serviceId: 'nest-typescript-starter',
      }),
    );
    // 模块与 instrument 必须来自同一次创建，分别交给 Nest 模块系统和应用工厂。
    appOptions.instrument = ObserveInstrument;
  }
  return { appModule, appOptions };
}
