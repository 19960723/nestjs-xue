import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { Environment } from '../config/env.validation.js';

export interface SwaggerRegistration {
  uiPath: string;
}

/** 注册工具文档并返回展示路径，成功地址由入口在 listen 后输出。 */
export function configureSwagger(
  app: INestApplication,
): SwaggerRegistration | undefined {
  const configService = app.get(ConfigService<Environment, true>);
  if (!configService.getOrThrow('SWAGGER_ENABLE', { infer: true })) {
    return undefined;
  }

  // 默认值及类型转换由 env.validation 统一提供。
  const swaggerPath = configService.getOrThrow('SWAGGER_PATH', { infer: true });
  const documentConfig = new DocumentBuilder()
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

  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // 只规范化展示路径，文档的实际注册路径保持原配置。
  return { uiPath: `/${swaggerPath.replace(/^\/+/, '')}` };
}
