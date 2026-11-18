import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'supertest';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { createAppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';

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
  let adminUsername = '';
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
    adminUsername = `itadmin${stamp}`;

    await createUser(loginUsername);
    await createUser(noPermissionUsername);
    await createUser(readerUsername, readerRole.id);
    revokeUserId = await createUser(revokeUsername, readerRole.id);
    await createUser(refreshUsername);
    await createUser(logoutUsername);
    await createUser(logoutAllUsername);
    await createUser(passwordUsername);
    await createUser(operatorUsername, operatorRole.id);
    adminUserId = await createUser(adminUsername, adminRole.id);
  }, 120000);

  afterAll(async () => {
    try {
      if (prisma) {
        await dropAuditBlock();
      }
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

  it('停用后旧会话失效，再次登录返回 401', async () => {
    const username = `itoff${stamp}`;
    const userId = await createUser(username);
    const session = await login(username);
    const admin = await login(adminUsername);

    const disabled = await request(server())
      .patch(`${API}/users/${userId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 0 });
    expectEnvelope(disabled, 200, 'OK');
    await expectSessionRejected(session);

    const again = await postLogin(username, PASSWORD);
    expectEnvelope(again, 401, 'UNAUTHENTICATED');
  });

  it('软删除后旧会话失效，再次登录返回 401', async () => {
    const username = `itdel${stamp}`;
    const userId = await createUser(username);
    const session = await login(username);
    const admin = await login(adminUsername);

    const removed = await request(server())
      .delete(`${API}/users/${userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expectEnvelope(removed, 200, 'OK');
    await expectSessionRejected(session);

    const again = await postLogin(username, PASSWORD);
    expectEnvelope(again, 401, 'UNAUTHENTICATED');
  });

  it('两名管理员同时互清角色后仍剩一名', async () => {
    const db = database();
    const adminRole = await db.role.findUnique({
      where: { code: 'admin' },
      select: { id: true },
    });
    if (!adminRole) {
      throw new Error('缺少管理员角色');
    }
    await db.userRole.delete({
      where: { userId_roleId: { userId: adminUserId, roleId: adminRole.id } },
    });

    try {
      const leftName = `itleft${stamp}`;
      const rightName = `itright${stamp}`;
      const leftId = await createUser(leftName, adminRole.id);
      const rightId = await createUser(rightName, adminRole.id);
      const left = await login(leftName);
      const right = await login(rightName);
      const [clearRight, clearLeft] = await Promise.all([
        request(server())
          .put(`${API}/users/${rightId}/roles`)
          .set('Authorization', `Bearer ${left.accessToken}`)
          .send({ roleIds: [] }),
        request(server())
          .put(`${API}/users/${leftId}/roles`)
          .set('Authorization', `Bearer ${right.accessToken}`)
          .send({ roleIds: [] }),
      ]);

      expect([clearRight.status, clearLeft.status].sort()).toEqual([200, 409]);
      expect([clearRight.body.code, clearLeft.body.code].sort()).toEqual([
        'CONFLICT',
        'OK',
      ]);
      expect(typeof clearRight.body.requestId).toBe('string');
      expect(typeof clearLeft.body.requestId).toBe('string');
      const remaining = await db.userRole.count({
        where: {
          roleId: adminRole.id,
          user: { deletedAt: null, status: 1 },
        },
      });
      expect(remaining).toBe(1);
    } finally {
      await db.userRole.upsert({
        where: {
          userId_roleId: { userId: adminUserId, roleId: adminRole.id },
        },
        update: {},
        create: { userId: adminUserId, roleId: adminRole.id },
      });
    }
  });

  it('审计写入失败时，启用和停用一起回滚', async () => {
    const disabledId = await createUser(`itkeepoff${stamp}`);
    await database().user.update({
      where: { id: disabledId },
      data: { status: 0 },
    });
    const enabledId = await createUser(`itkeepon${stamp}`);
    const enabledBefore = await userState(enabledId);
    const admin = await login(adminUsername);

    await withAuditBlocked(async () => {
      const enable = await request(server())
        .patch(`${API}/users/${disabledId}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 1 });
      expectEnvelope(enable, 500, 'INTERNAL_ERROR');

      const disable = await request(server())
        .patch(`${API}/users/${enabledId}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 0 });
      expectEnvelope(disable, 500, 'INTERNAL_ERROR');
    });

    expect(await userState(disabledId)).toMatchObject({ status: 0 });
    expect(await userState(enabledId)).toEqual(enabledBefore);
    expect(await auditCount('users.enable', disabledId)).toBe(0);
    expect(await auditCount('users.disable', enabledId)).toBe(0);
  });

  it('审计写入失败时，软删除和角色替换一起回滚', async () => {
    const db = database();
    const userId = await createUser(`itkeepdel${stamp}`);
    const before = await userState(userId);
    const readerRole = await db.role.findUnique({
      where: { code: `itread${stamp}` },
      select: { id: true },
    });
    if (!readerRole) {
      throw new Error('缺少只读角色');
    }
    const memberId = await createUser(`itkeeprole${stamp}`, readerRole.id);
    const admin = await login(adminUsername);

    await withAuditBlocked(async () => {
      const removed = await request(server())
        .delete(`${API}/users/${userId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expectEnvelope(removed, 500, 'INTERNAL_ERROR');

      const cleared = await request(server())
        .put(`${API}/users/${memberId}/roles`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ roleIds: [] });
      expectEnvelope(cleared, 500, 'INTERNAL_ERROR');
    });

    expect(await userState(userId)).toEqual(before);
    expect(await auditCount('users.delete', userId)).toBe(0);
    const roles = await db.userRole.count({ where: { userId: memberId } });
    expect(roles).toBe(1);
    expect(await auditCount('users.assign-roles', memberId)).toBe(0);
  });

  it('审计写入失败时，改密和退出一起回滚', async () => {
    const passwordName = `itkeeppass${stamp}`;
    const passwordUserId = await createUser(passwordName);
    const passwordSession = await login(passwordName);
    const logoutName = `itkeeplogout${stamp}`;
    const logoutUserId = await createUser(logoutName);
    const logoutSession = await login(logoutName);
    const before = await userState(passwordUserId);

    await withAuditBlocked(async () => {
      const changed = await request(server())
        .patch(`${API}/auth/password`)
        .set('Authorization', `Bearer ${passwordSession.accessToken}`)
        .send({ oldPassword: PASSWORD, newPassword: NEXT_PASSWORD });
      expectEnvelope(changed, 503, 'SERVICE_UNAVAILABLE');

      const loggedOut = await request(server())
        .post(`${API}/auth/logout`)
        .set('Authorization', `Bearer ${logoutSession.accessToken}`);
      expectEnvelope(loggedOut, 503, 'SERVICE_UNAVAILABLE');
    });

    expect(await userState(passwordUserId)).toEqual(before);
    const me = await request(server())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${passwordSession.accessToken}`);
    expectEnvelope(me, 200, 'OK');
    const oldLogin = await postLogin(passwordName, PASSWORD);
    expectEnvelope(oldLogin, 200, 'OK');
    readTokens(oldLogin);
    const newLogin = await postLogin(passwordName, NEXT_PASSWORD);
    expectEnvelope(newLogin, 401, 'UNAUTHENTICATED');

    const stillIn = await request(server())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${logoutSession.accessToken}`);
    expectEnvelope(stillIn, 200, 'OK');
    expect(await auditCount('auth.change-password', passwordUserId)).toBe(0);
    expect(
      await database().auditLog.count({
        where: { action: 'auth.logout', actorUserId: logoutUserId },
      }),
    ).toBe(0);
  });

  it('Redis 断开时存活仍为 200，就绪和登录为 503，恢复后就绪回到 200', async () => {
    const client = redisClient();
    let disconnected = false;
    try {
      client.disconnect();
      disconnected = true;

      const live = await request(server()).get(`${API}/health/live`);
      expectEnvelope(live, 200, 'OK');
      const ready = await request(server()).get(`${API}/health/ready`);
      expectEnvelope(ready, 503, 'SERVICE_UNAVAILABLE');
      const blocked = await postLogin(loginUsername, PASSWORD);
      expectEnvelope(blocked, 503, 'SERVICE_UNAVAILABLE');

      await client.connect();
      disconnected = false;
      const recovered = await request(server()).get(`${API}/health/ready`);
      expectEnvelope(recovered, 200, 'OK');
    } finally {
      if (disconnected) {
        await client.connect();
      }
    }
  });

  it('创建用户、首次设密、角色变更和替换权限写入同一条审计', async () => {
    const admin = await login(adminUsername);
    const authz = { Authorization: `Bearer ${admin.accessToken}` };
    const username = `itaudit${stamp}`;
    const created = await request(server())
      .post(`${API}/users`)
      .set(authz)
      .send({ email: `${username}@example.com`, username });
    expectEnvelope(created, 201, 'OK');
    expect(created.body.data.password).toBeUndefined();
    const userId = readId(created);
    userIds.push(userId);
    await expectAudit('users.create', 'user', userId, created.body.requestId);

    const passwordSet = await request(server())
      .post(`${API}/users/${userId}/password`)
      .set(authz)
      .send({ password: PASSWORD });
    expectEnvelope(passwordSet, 200, 'OK');
    expect(passwordSet.body.data.password).toBeUndefined();
    await expectAudit(
      'users.set-password',
      'user',
      userId,
      passwordSet.body.requestId,
    );

    const code = `raudit${stamp}`;
    const roleCreated = await request(server())
      .post(`${API}/roles`)
      .set(authz)
      .send({ name: '审计角色', code });
    expectEnvelope(roleCreated, 201, 'OK');
    const roleId = readId(roleCreated);
    roleIds.push(roleId);
    await expectAudit(
      'roles.create',
      'role',
      roleId,
      roleCreated.body.requestId,
    );

    const duplicate = await request(server())
      .post(`${API}/roles`)
      .set(authz)
      .send({ name: '审计角色', code });
    expectEnvelope(duplicate, 409, 'CONFLICT');
    expect(await auditCount('roles.create', roleId)).toBe(1);

    const renamed = await request(server())
      .patch(`${API}/roles/${roleId}`)
      .set(authz)
      .send({ name: '审计角色二' });
    expectEnvelope(renamed, 200, 'OK');
    await expectAudit('roles.update', 'role', roleId, renamed.body.requestId);

    const readPermission = await database().permission.findUnique({
      where: { code: 'users:read' },
      select: { id: true },
    });
    if (!readPermission) {
      throw new Error('权限种子缺失');
    }
    const replaced = await request(server())
      .put(`${API}/roles/${roleId}/permissions`)
      .set(authz)
      .send({ permissionIds: [readPermission.id] });
    expectEnvelope(replaced, 200, 'OK');
    await expectAudit(
      'roles.assign-permissions',
      'role',
      roleId,
      replaced.body.requestId,
    );

    const removed = await request(server())
      .delete(`${API}/roles/${roleId}`)
      .set(authz);
    expectEnvelope(removed, 200, 'OK');
    await expectAudit('roles.delete', 'role', roleId, removed.body.requestId);
  });

  it('审计失败时，创建用户、首次设密、角色变更和替换权限一起回滚', async () => {
    const admin = await login(adminUsername);
    const authz = { Authorization: `Bearer ${admin.accessToken}` };
    const keptName = `itkept${stamp}`;
    const kept = await request(server())
      .post(`${API}/users`)
      .set(authz)
      .send({ email: `${keptName}@example.com`, username: keptName });
    expectEnvelope(kept, 201, 'OK');
    const keptId = readId(kept);
    userIds.push(keptId);

    const held = await request(server())
      .post(`${API}/roles`)
      .set(authz)
      .send({ name: '待替换角色', code: `rheld${stamp}` });
    expectEnvelope(held, 201, 'OK');
    const heldId = readId(held);
    roleIds.push(heldId);

    const readPermission = await database().permission.findUnique({
      where: { code: 'users:read' },
      select: { id: true },
    });
    if (!readPermission) {
      throw new Error('权限种子缺失');
    }

    const missedName = `itmiss${stamp}`;
    await withAuditBlocked(async () => {
      const created = await request(server())
        .post(`${API}/users`)
        .set(authz)
        .send({
          email: `${missedName}@example.com`,
          username: missedName,
        });
      expectEnvelope(created, 500, 'INTERNAL_ERROR');

      const passwordSet = await request(server())
        .post(`${API}/users/${keptId}/password`)
        .set(authz)
        .send({ password: PASSWORD });
      expectEnvelope(passwordSet, 500, 'INTERNAL_ERROR');

      const role = await request(server())
        .post(`${API}/roles`)
        .set(authz)
        .send({ name: '回滚角色', code: `rmiss${stamp}` });
      expectEnvelope(role, 500, 'INTERNAL_ERROR');

      const renamed = await request(server())
        .patch(`${API}/roles/${heldId}`)
        .set(authz)
        .send({ name: '不应改名' });
      expectEnvelope(renamed, 500, 'INTERNAL_ERROR');

      const replaced = await request(server())
        .put(`${API}/roles/${heldId}/permissions`)
        .set(authz)
        .send({ permissionIds: [readPermission.id] });
      expectEnvelope(replaced, 500, 'INTERNAL_ERROR');

      const removed = await request(server())
        .delete(`${API}/roles/${heldId}`)
        .set(authz);
      expectEnvelope(removed, 500, 'INTERNAL_ERROR');
    });

    expect(
      await database().user.findUnique({
        where: { username: missedName },
        select: { id: true },
      }),
    ).toBeNull();
    expect(
      await database().user.findFirst({
        where: { id: keptId, password: null },
        select: { id: true },
      }),
    ).not.toBeNull();
    expect(
      await database().role.findUnique({
        where: { code: `rmiss${stamp}` },
        select: { id: true },
      }),
    ).toBeNull();
    const heldRole = await database().role.findUnique({
      where: { id: heldId },
      select: { name: true },
    });
    expect(heldRole).toEqual({ name: '待替换角色' });
    expect(
      await database().rolePermission.count({ where: { roleId: heldId } }),
    ).toBe(0);
    expect(await auditCount('users.set-password', keptId)).toBe(0);
    expect(await auditCount('roles.update', heldId)).toBe(0);
    expect(await auditCount('roles.assign-permissions', heldId)).toBe(0);
    expect(await auditCount('roles.delete', heldId)).toBe(0);
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

  async function userState(id: number) {
    const user = await database().user.findUnique({
      where: { id },
      select: { status: true, tokenVersion: true, deletedAt: true },
    });
    if (!user) {
      throw new Error('用户不存在');
    }
    return user;
  }

  async function auditCount(action: string, targetId: number): Promise<number> {
    return database().auditLog.count({
      where: { action, targetId: String(targetId) },
    });
  }

  async function expectAudit(
    action: string,
    targetType: string,
    targetId: number,
    requestId: string,
  ): Promise<void> {
    const row = await database().auditLog.findFirst({
      where: {
        actorUserId: adminUserId,
        action,
        targetType,
        targetId: String(targetId),
        requestId,
      },
      select: { id: true },
    });
    expect(row).not.toBeNull();
  }

  async function withAuditBlocked(run: () => Promise<void>): Promise<void> {
    await dropAuditBlock();
    // 已有审计行会让恒不成立的检查加不上去。这些行只属于当前测试库。
    await runSql('DELETE FROM audit_logs');
    await runSql(
      'ALTER TABLE audit_logs ADD CONSTRAINT audit_insert_fail CHECK (1 = 0)',
    );
    try {
      await run();
    } finally {
      await dropAuditBlock();
    }
  }

  function redisClient(): {
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

  async function dropAuditBlock(): Promise<void> {
    const rows = await querySql(
      "SELECT CONSTRAINT_NAME AS constraintName FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'audit_insert_fail'",
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }
    await querySql('ALTER TABLE audit_logs DROP CHECK audit_insert_fail');
  }

  async function runSql(sql: string): Promise<void> {
    await querySql(sql);
  }

  async function querySql(sql: string): Promise<unknown> {
    if (!app) {
      throw new Error('应用尚未启动');
    }
    const databaseUrl = app
      .get(ConfigService)
      .getOrThrow<string>('DATABASE_URL');
    const url = new URL(databaseUrl);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (
      (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') ||
      !/^init_xue_test_[a-z0-9]+$/.test(databaseName)
    ) {
      throw new Error('拒绝在非测试库执行语句');
    }
    const require = createRequire(
      import.meta.resolve('@prisma/adapter-mariadb'),
    );
    const mariadb = require('mariadb') as {
      createConnection(options: object): Promise<{
        query(statement: string): Promise<unknown>;
        end(): Promise<void>;
      }>;
    };
    const connection = await mariadb.createConnection({
      host: url.hostname,
      port: url.port === '' ? 3306 : Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: databaseName,
      allowPublicKeyRetrieval: true,
    });
    try {
      return await connection.query(sql);
    } catch (error: unknown) {
      throw new Error(`测试库语句失败：${readErrno(error) || 'unknown'}`, {
        cause: error,
      });
    } finally {
      await connection.end();
    }
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

function readErrno(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'errno' in error) {
    return Number(error.errno);
  }
  return 0;
}

function readId(response: Response): number {
  const data: unknown = response.body.data;
  if (!data || typeof data !== 'object' || !('id' in data)) {
    throw new Error(`响应缺少对象编号，状态 ${response.status}`);
  }
  const id = (data as { id: unknown }).id;
  if (!Number.isInteger(id)) {
    throw new Error(`响应缺少对象编号，状态 ${response.status}`);
  }
  return id as number;
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
