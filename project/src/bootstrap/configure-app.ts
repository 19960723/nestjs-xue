import { VersioningType, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

/** 在 listen/init 前调用，确保实际应用与 E2E 使用相同的 HTTP 路径规则。 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // 组合全局前缀后得到 /api/v1/...；后续 Pipe、过滤器等共用规则也在此接入。
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // 验证dto
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
