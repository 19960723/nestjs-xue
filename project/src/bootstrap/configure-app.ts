import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { INestApplication, ValidationError } from '@nestjs/common';
import { formatValidationDetails } from '../common/validation/format-validation-details.js';

/** 在 listen/init 前调用，确保实际应用与 E2E 使用相同的 HTTP 规则。 */
export function configureApp(app: INestApplication): void {
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
