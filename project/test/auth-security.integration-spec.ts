import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'supertest';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { createAppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';

const PASSWORD = 'integration-pass-1';
const NEXT_PASSWORD = 'integration-pass-2';
const API = '/api/v1';

describe('认证与授权安全场景', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let passwordHash = '';
  const userIds: number[] = [];
  const roleIds: number[] = [];
  const stamp = Date.now().toString(36);

  let loginUsername = '';
  let noPermissionUsername = '';
  let readerUsername = '';
  let revokeUsername = '';
  let refreshUsername = '';
  let logoutUsername = '';
  let logoutAllUsername = '';
  let passwordUsername = '';
  let operatorUsername = '';
  let adminUserId = 0;
  let revokeUserId = 0;

  beforeAll(async () => {
    const { appModule, appOptions } = await createAppModule();
    const moduleFixture = await Test.createTestingModule({
      imports: [appModule],
    }).compile();
    app =
      moduleFixture.createNestApplication<NestExpressApplication>(appOptions);
    configureApp(app);
    await app.init();

    const databaseUrl = app
      .get(ConfigService)
      .getOrThrow<string>('DATABASE_URL');
    const databaseName = decodeURIComponent(
      new URL(databaseUrl).pathname.replace(/^\//, ''),
    );
    if (!/^init_xue_test_[a-z0-9]+$/.test(databaseName)) {
      throw new Error('应用连接到了非测试库，测试停止');
    }

    const db = app.get(PrismaService);
    prisma = db;
    passwordHash = await hash(PASSWORD, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const readPermission = await db.permission.findUnique({
      where: { code: 'users:read' },
      select: { id: true },
    });
    const deletePermission = await db.permission.findUnique({
      where: { code: 'users:delete' },
      select: { id: true },
    });
    const assignPermission = await db.permission.findUnique({
      where: { code: 'users:assign-roles' },
      select: { id: true },
    });
    const adminRole = await db.role.findUnique({
      where: { code: 'admin' },
      select: { id: true },
    });
    if (
      !readPermission ||
      !deletePermission ||
      !assignPermission ||
      !adminRole
    ) {
      throw new Error('权限种子缺失');
    }

    const readerRole = await db.role.create({
      data: {
        name: '集成只读',
        code: `itread${stamp}`,
        status: 1,
        permissions: { create: [{ permissionId: readPermission.id }] },
      },
      select: { id: true },
    });
    const operatorRole = await db.role.create({
      data: {
        name: '集成操作',
        code: `itop${stamp}`,
        status: 1,
        permissions: {
          create: [
            { permissionId: deletePermission.id },
            { permissionId: assignPermission.id },
          ],
        },
      },
      select: { id: true },
    });
    roleIds.push(readerRole.id, operatorRole.id);

    loginUsername = `itlogin${stamp}`;
    noPermissionUsername = `itnone${stamp}`;
    readerUsername = `itreader${stamp}`;
    revokeUsername = `itrevoke${stamp}`;
    refreshUsername = `itrefresh${stamp}`;
    logoutUsername = `itlogout${stamp}`;
    logoutAllUsername = `itall${stamp}`;
    passwordUsername = `itpass${stamp}`;
    operatorUsername = `itoperator${stamp}`;

    await createUser(loginUsername);
    await createUser(noPermissionUsername);
    await createUser(readerUsername, readerRole.id);
    revokeUserId = await createUser(revokeUsername, readerRole.id);
    await createUser(refreshUsername);
    await createUser(logoutUsername);
    await createUser(logoutAllUsername);
    await createUser(passwordUsername);
    await createUser(operatorUsername, operatorRole.id);
    adminUserId = await createUser(`itadmin${stamp}`, adminRole.id);
  }, 120000);

  afterAll(async () => {
    try {
      if (prisma && userIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { actorUserId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (prisma && roleIds.length > 0) {
        await prisma.role.deleteMany({
          where: { id: { in: roleIds }, isSystem: false },
        });
      }
    } finally {
      await app?.close();
    }
  }, 30000);

  it('密码错误和用户不存在返回同一个 401', async () => {
    const wrongPassword = await postLogin(loginUsername, NEXT_PASSWORD);
    const missingUser = await postLogin(`itmissing${stamp}`, PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(missingUser.status).toBe(401);
    expect(wrongPassword.body.code).toBe('UNAUTHENTICATED');
    expect(missingUser.body.code).toBe('UNAUTHENTICATED');
    expect(wrongPassword.body.message).toBe(missingUser.body.message);
    expect(wrongPassword.body.data).toBeNull();
    expect(missingUser.body.data).toBeNull();
    expect(typeof wrongPassword.body.requestId).toBe('string');
    expect(typeof missingUser.body.requestId).toBe('string');
  });

  it('无令牌返回 401，无权限返回 403', async () => {
    const anonymous = await request(server()).get(`${API}/users`);
    expectEnvelope(anonymous, 401, 'UNAUTHENTICATED');

    const noPermission = await login(noPermissionUsername);
    const forbidden = await request(server())
      .get(`${API}/users`)
      .set('Authorization', `Bearer ${noPermission.accessToken}`);
    expectEnvelope(forbidden, 403, 'FORBIDDEN');
  });

  it('有读取权限可以访问用户列表', async () => {
    const reader = await login(readerUsername);
    const response = await request(server())
      .get(`${API}/users`)
      .set('Authorization', `Bearer ${reader.accessToken}`);
    expectEnvelope(response, 200, 'OK');
  });

  it('撤掉角色后原 Access 立即 403，当前用户仍可读取', async () => {
    const reader = await login(revokeUsername);
    const admin = await login(`itadmin${stamp}`);
    const before = await request(server())
      .get(`${API}/users`)
      .set('Authorization', `Bearer ${reader.accessToken}`);
    expectEnvelope(before, 200, 'OK');

    const cleared = await request(server())
      .put(`${API}/users/${revokeUserId}/roles`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ roleIds: [] });
    expectEnvelope(cleared, 200, 'OK');

    const after = await request(server())
      .get(`${API}/users`)
      .set('Authorization', `Bearer ${reader.accessToken}`);
    expectEnvelope(after, 403, 'FORBIDDEN');

    const me = await request(server())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${reader.accessToken}`);
    expectEnvelope(me, 200, 'OK');
  });

  it('Refresh 轮换成功，旧 Refresh 重放后整段会话失效', async () => {
    const first = await login(refreshUsername);
    const rotated = await request(server())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: first.refreshToken });
    expectEnvelope(rotated, 200, 'OK');
    const next = readTokens(rotated);

    const replay = await request(server())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: first.refreshToken });
    expectEnvelope(replay, 401, 'UNAUTHENTICATED');

    const me = await request(server())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${next.accessToken}`);
    expectEnvelope(me, 401, 'UNAUTHENTICATED');
  });

  it('退出当前会话后，旧 Access 和 Refresh 失效', async () => {
    const session = await login(logoutUsername);
    const loggedOut = await request(server())
      .post(`${API}/auth/logout`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expectEnvelope(loggedOut, 200, 'OK');
    await expectSessionRejected(session);
  });

  it('全部退出后，旧 Access 和 Refresh 失效', async () => {
    const session = await login(logoutAllUsername);
    const loggedOut = await request(server())
      .post(`${API}/auth/logout-all`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expectEnvelope(loggedOut, 200, 'OK');
    await expectSessionRejected(session);
  });

  it('修改密码后，旧 Access 和 Refresh 失效', async () => {
    const session = await login(passwordUsername);
    const changed = await request(server())
      .patch(`${API}/auth/password`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ oldPassword: PASSWORD, newPassword: NEXT_PASSWORD });
    expectEnvelope(changed, 200, 'OK');
    await expectSessionRejected(session);

    const relogin = await postLogin(passwordUsername, NEXT_PASSWORD);
    expectEnvelope(relogin, 200, 'OK');
    readTokens(relogin);
  });

  it('不能删除或清空最后一名有效管理员', async () => {
    const operator = await login(operatorUsername);
    const removed = await request(server())
      .delete(`${API}/users/${adminUserId}`)
      .set('Authorization', `Bearer ${operator.accessToken}`);
    expectEnvelope(removed, 409, 'CONFLICT');

    const cleared = await request(server())
      .put(`${API}/users/${adminUserId}/roles`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ roleIds: [] });
    expectEnvelope(cleared, 409, 'CONFLICT');
  });

  function server() {
    if (!app) {
      throw new Error('应用尚未启动');
    }
    return app.getHttpServer();
  }

  function database(): PrismaService {
    if (!prisma) {
      throw new Error('数据库尚未连接');
    }
    return prisma;
  }

  async function createUser(
    username: string,
    roleId?: number,
  ): Promise<number> {
    const user = await database().user.create({
      data: {
        username,
        email: `${username}@example.test`,
        password: passwordHash,
        status: 1,
        ...(roleId ? { roles: { create: [{ roleId }] } } : {}),
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function postLogin(
    username: string,
    password: string,
  ): Promise<Response> {
    return request(server())
      .post(`${API}/auth/login`)
      .send({ username, password });
  }

  async function login(username: string): Promise<TokenPair> {
    const response = await postLogin(username, PASSWORD);
    expectEnvelope(response, 200, 'OK');
    return readTokens(response);
  }

  async function expectSessionRejected(session: TokenPair): Promise<void> {
    const me = await request(server())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expectEnvelope(me, 401, 'UNAUTHENTICATED');

    const refresh = await request(server())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: session.refreshToken });
    expectEnvelope(refresh, 401, 'UNAUTHENTICATED');
  }
});

interface TokenPair {
  accessToken: string;
  refreshToken: string;
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

function readTokens(response: Response): TokenPair {
  const data: unknown = response.body.data;
  if (!data || typeof data !== 'object') {
    throw new Error(`登录响应缺少数据，状态 ${response.status}`);
  }
  const record = data as Record<string, unknown>;
  if (
    typeof record.accessToken !== 'string' ||
    typeof record.refreshToken !== 'string' ||
    record.accessToken.length < 20 ||
    record.refreshToken.length < 20
  ) {
    throw new Error(`登录响应缺少令牌，状态 ${response.status}`);
  }
  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
  };
}
