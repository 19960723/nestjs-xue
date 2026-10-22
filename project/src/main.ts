import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createAppModule } from './app.module.js';
import { configureApp } from './bootstrap/configure-app.js';
import type { Environment } from './config/env.validation.js';

/** 启动入口：组装配置和模块 → 创建应用 → 应用 HTTP 规则 → 监听端口。 */
async function bootstrap(): Promise<void> {
  // 工厂先校验环境，再决定是否接入 Observe；校验失败时不会创建 HTTP 应用。
  const { appModule, appOptions } = await createAppModule();
  const app = await NestFactory.create(appModule, appOptions);
  const configService = app.get(ConfigService<Environment, true>);
  const logger = new Logger('Bootstrap');

  
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

  // 配置 Swagger 文档
  const swaggerEnable = configService.get<boolean>('SWAGGER_ENABLE') !== false;
  console.log(swaggerEnable, '~~')
  if (swaggerEnable) {
    const doc_config = new DocumentBuilder()
      .setTitle('NestJS 企业级项目 API')
      .setDescription('于 NestJS + Prisma + MySQL 的企业级后端项目 API 文档')
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: '请输入 JWT Token',
        in: 'header',
      })
      .build();

    const document = SwaggerModule.createDocument(app, doc_config);
    const swaggerPath = configService.get<string>('SWAGGER_PATH') || 'api/docs';
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true, // 持久化认证信息
      },
    });
    logger.log(
      `Swagger 文档已启用: http://localhost:${configService.get('PORT') || 3000}/${swaggerPath}`,
    );
  }

  // 使用已校验的数字端口和监听地址，避免再次读取未经转换的环境字符串。

  const port = configService.get('PORT', { infer: true });
  const host = configService.get('HOST', { infer: true });
  await app.listen(port, host);

  logger.log(`🚀 应用启动成功！`);
  logger.log(`📡 服务地址: ${await app.getUrl()}/api/v1`);
  logger.log(
    `📚 API 文档: ${await app.getUrl()}/${configService.get('swagger.path') || 'api/docs'}`,
  );
}

await bootstrap();
