import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createAppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';

describe('Application (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // 复用实际启动的配置工厂，避免测试绕过环境校验或模块注册。
    const { appModule, appOptions } = await createAppModule();
    const moduleFixture = await Test.createTestingModule({
      imports: [appModule],
    }).compile();
    app = moduleFixture.createNestApplication(appOptions);
    // 必须在 init 前注册与 main 相同的 HTTP 规则，否则测到的路由会不同。
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    // 释放 HTTP 服务与模块资源，避免 Jest 因残留句柄无法退出。
    await app.close();
  });

  it('GET /api/v1/health/live exposes only liveness', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'api-contract-01')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toMatchObject({
      code: 'OK',
      message: 'ok',
      data: { status: 'ok' },
      requestId: 'api-contract-01',
    });
    expect(response.headers['x-request-id']).toBe('api-contract-01');
  });

  it.each(['/', '/health/live', '/api/health/live'])(
    'GET %s does not bypass the prefix or version',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(404);

      expect(response.body).toMatchObject({
        code: 'NOT_FOUND',
        data: null,
      });
      expect(typeof response.body.requestId).toBe('string');
    },
  );
});
