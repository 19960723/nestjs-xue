import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { createAppModule } from './app.module.js';
import { configureApp } from './bootstrap/configure-app.js';
import { configureSwagger } from './bootstrap/configure-swagger.js'
import type { Environment } from './config/env.validation.js';

/** 启动入口：组装配置和模块 → 创建应用 → 应用 HTTP 规则 → 监听端口。 */
async function bootstrap(): Promise<void> {
  // 工厂先校验环境，再决定是否接入 Observe；校验失败时不会创建 HTTP 应用。
  const { appModule, appOptions } = await createAppModule();
  const app = await NestFactory.create(appModule, appOptions);
  const configService = app.get(ConfigService<Environment, true>);
  const logger = new Logger('Bootstrap');

  
  configureApp(app);

  configureSwagger(app);

  // 仅在真实进程入口监听退出信号，供后续数据库等资源执行关闭钩子。
  app.enableShutdownHooks();

  

  

  // 使用已校验的数字端口和监听地址，避免再次读取未经转换的环境字符串。

  const port = configService.get('PORT', { infer: true });
  const host = configService.get('HOST', { infer: true });
  await app.listen(port, host);

  logger.log(`🚀 应用启动成功！`);
  logger.log(`📡 服务地址: ${await app.getUrl()}/api/v1`);
  // logger.log(
  //   `📚 API 文档: ${await app.getUrl()}/${configService.get('SWAGGER_PATH') || 'api/docs'}`,
  // );
}

await bootstrap();
