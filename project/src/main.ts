import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppModule } from './app.module.js';
import { configureApp } from './bootstrap/configure-app.js';
import type { Environment } from './config/env.validation.js';

/** 启动入口：组装配置和模块 → 创建应用 → 应用 HTTP 规则 → 监听端口。 */
async function bootstrap(): Promise<void> {
  // 工厂先校验环境，再决定是否接入 Observe；校验失败时不会创建 HTTP 应用。
  const { appModule, appOptions } = await createAppModule();
  const app = await NestFactory.create(appModule, appOptions);
  configureApp(app); 
  // 仅在真实进程入口监听退出信号，供后续数据库等资源执行关闭钩子。
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );


  // 使用已校验的数字端口和监听地址，避免再次读取未经转换的环境字符串。
  const config = app.get(ConfigService<Environment, true>);
  const port = config.get('PORT', { infer: true });
  const host = config.get('HOST', { infer: true });
  await app.listen(port, host);
  new Logger('Bootstrap').log(`服务地址: ${await app.getUrl()}/api/v1`);
}

await bootstrap();
