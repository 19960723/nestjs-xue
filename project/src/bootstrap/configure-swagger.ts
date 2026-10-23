
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

import type { Environment } from '../config/env.validation.js';
import type { INestApplication } from '@nestjs/common';

export function configureSwagger(app: INestApplication): void {
  const logger = new Logger('Swagger');
  // 获取配置服务
  const configService = app.get(ConfigService<Environment, true>);

  // 配置 Swagger 文档
  const swaggerEnable = configService.get<boolean>('SWAGGER_ENABLE') !== false;
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
}
