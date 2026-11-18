import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'supertest';
import request from 'supertest';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { createAppModule } from '../src/app.module.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';

const API = '/api/v1';

describe('全局限流', () => {
  let first: NestExpressApplication | undefined;
  let second: NestExpressApplication | undefined;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = '3';
    process.env.RATE_LIMIT_WINDOW_SECONDS = '60';
    first = await boot();
    second = await boot();
  }, 120000);

  afterAll(async () => {
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.RATE_LIMIT_WINDOW_SECONDS = '60';
    await first?.close();
    await second?.close();
  }, 30000);

  it('两个实例共享额度，超限返回 429，存活不计数，断开后返回 503', async () => {
    const primary = server(first);
    const replica = server(second);
    const responses = await Promise.all([
      request(primary)
        .get(`${API}/users`)
        .set('X-Forwarded-For', '203.0.113.1'),
      request(replica)
        .get(`${API}/users`)
        .set('X-Forwarded-For', '203.0.113.2'),
      request(primary)
        .get(`${API}/users`)
        .set('X-Forwarded-For', '203.0.113.3'),
      request(replica)
        .get(`${API}/users`)
        .set('X-Forwarded-For', '203.0.113.4'),
    ]);
    const allowed = responses.filter((item) => item.status === 401);
    const limited = responses.filter((item) => item.status === 429);
    expect(allowed).toHaveLength(3);
    expect(limited).toHaveLength(1);
    for (const item of allowed) {
      expectEnvelope(item, 401, 'UNAUTHENTICATED');
    }
    expectEnvelope(limited[0], 429, 'RATE_LIMITED');
    expect(limited[0].body.message).toBe('尝试过于频繁');
    expect(limited[0].headers['retry-after']).toMatch(/^[1-9]\d*$/);

    const live = await request(primary).get(`${API}/health/live`);
    expectEnvelope(live, 200, 'OK');
    const replicaLive = await request(replica).get(`${API}/health/live`);
    expectEnvelope(replicaLive, 200, 'OK');

    const again = await request(replica).get(`${API}/users`);
    expectEnvelope(again, 429, 'RATE_LIMITED');

    const client = redisClient(first);
    let disconnected = false;
    try {
      client.disconnect();
      disconnected = true;
      const blocked = await request(primary).get(`${API}/users`);
      expectEnvelope(blocked, 503, 'SERVICE_UNAVAILABLE');
      const ready = await request(primary).get(`${API}/health/ready`);
      expectEnvelope(ready, 503, 'SERVICE_UNAVAILABLE');
      const stillLive = await request(primary).get(`${API}/health/live`);
      expectEnvelope(stillLive, 200, 'OK');
    } finally {
      if (disconnected) {
        await client.connect();
      }
    }

    const recovered = await request(primary).get(`${API}/users`);
    expectEnvelope(recovered, 429, 'RATE_LIMITED');
    const other = await request(replica).get(`${API}/users`);
    expectEnvelope(other, 429, 'RATE_LIMITED');
  });
});

async function boot(): Promise<NestExpressApplication> {
  const { appModule, appOptions } = await createAppModule();
  const moduleFixture = await Test.createTestingModule({
    imports: [appModule],
  }).compile();
  const app =
    moduleFixture.createNestApplication<NestExpressApplication>(appOptions);
  configureApp(app);
  await app.init();

  const config = app.get(ConfigService);
  const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
  const databaseName = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ''),
  );
  if (!/^init_xue_test_[a-z0-9]+$/.test(databaseName)) {
    throw new Error('应用连接到了非测试库，测试停止');
  }
  if (config.getOrThrow<number>('RATE_LIMIT_MAX') !== 3) {
    throw new Error('全局限流额度不是本用例配置');
  }
  return app;
}

function server(app: NestExpressApplication | undefined) {
  if (!app) {
    throw new Error('应用尚未启动');
  }
  return app.getHttpServer();
}

function redisClient(app: NestExpressApplication | undefined): {
  disconnect(): void;
  connect(): Promise<void>;
} {
  if (!app) {
    throw new Error('应用尚未启动');
  }
  const client = (
    app.get(RedisService) as unknown as {
      client: { disconnect(): void; connect(): Promise<void> } | null;
    }
  ).client;
  if (!client) {
    throw new Error('Redis 客户端不存在');
  }
  return client;
}

function expectEnvelope(
  response: Response,
  status: number,
  code: string,
): void {
  expect(response.status).toBe(status);
  expect(response.body.code).toBe(code);
  expect(typeof response.body.requestId).toBe('string');
  expect(response.body.requestId.length).toBeGreaterThan(0);
}
