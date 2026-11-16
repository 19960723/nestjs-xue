import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Environment } from '../config/env.validation.js';
import { formatValidationDetails } from '../common/validation/format-validation-details.js';

/**
 * 在 listen/init 前调用，确保实际应用与 E2E 使用相同的 HTTP 规则。
 * 安全头、跨域和 JSON 体积在这里集中设置。不开启携带凭据的跨域。
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  // Helmet 会去掉 X-Powered-By。文档页需要内联脚本，开启 Swagger 时放宽内容安全策略。
  const swaggerEnabled = config.get('SWAGGER_ENABLE', { infer: true });
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled ? false : undefined,
      crossOriginEmbedderPolicy: swaggerEnabled ? false : undefined,
    }),
  );

  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: origins.length === 0 ? false : origins,
    credentials: false,
  });

  // 登录次数仍读取套接字地址，这里的跳数不会把 X-Forwarded-For 当成登录来源。
  const trustedProxy = config.get('TRUSTED_PROXY', { infer: true });
  if (trustedProxy !== null) {
    app.set('trust proxy', trustedProxy);
  }

  const jsonLimit = config.get('JSON_BODY_LIMIT_BYTES', { infer: true });
  app.useBodyParser('json', { limit: jsonLimit });

  app.setGlobalPrefix('api');
  // 组合全局前缀后得到 /api/v1/...。
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // DTO 转换和字段校验由实际启动与 E2E 共用。
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: '请求参数不合法',
          details: formatValidationDetails(errors),
        }),
    }),
  );
}
