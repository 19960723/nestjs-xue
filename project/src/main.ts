import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 创建应用实例
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // 启动应用
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 应用启动成功！`);
  logger.log(`📡 服务地址: http://localhost:${port}/api`);
}
await bootstrap();
