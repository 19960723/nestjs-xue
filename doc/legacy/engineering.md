> 历史归档（2026-10-21），原位置：`doc/05-进阶工程化.md`。以下保留旧方案用于追溯，其中版本、阶段、状态与代码示例可能过时；当前实施请从 [文档导航](../README.md) 开始。

# 第五阶段：进阶与工程化

目标：缓存、上传、事务、软删除、定时任务、限流、测试和部署。不必一天做完，按需选做。

前四阶段应已能独立运行：CRUD + 校验 + JWT。

## 建议顺序

Redis → 限流 → 软删除 / 事务 → 上传 → 定时任务 → 测试 → 健康检查 → Docker。

---

## 步骤 1：Redis 缓存

### 目的

热点读（用户详情、当前用户）少打 MySQL。登出黑名单也适合放 Redis。

### 安装

以 Nest 缓存抽象为例（版本随你安装时的文档微调）：

```bash
pnpm add ioredis cache-manager cache-manager-ioredis-yet
pnpm add @nestjs/cache-manager
```

`.env`：

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 模块

```ts
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';

CacheModule.registerAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => ({
    store: await redisStore({
      host: config.get('REDIS_HOST'),
      port: Number(config.get('REDIS_PORT')),
      ttl: 60_000, // 毫秒
    }),
  }),
}),
```

### 用法

```ts
constructor(
  private readonly prisma: PrismaService,
  @Inject(CACHE_MANAGER) private readonly cache: Cache,
) {}

async findOne(id: number) {
  const key = `user:${id}`;
  const cached = await this.cache.get(key);
  if (cached) return cached;

  const user = await this.prisma.user.findUnique({ where: { id }, select: userPublicSelect });
  if (!user) throw new NotFoundException('用户不存在');

  await this.cache.set(key, user, 60_000);
  return user;
}
```

更新、删除、改状态后必须删缓存：

```ts
await this.cache.del(`user:${id}`);
```

只缓存、不失效，会出现「库改了接口还是旧数据」。

### 登出黑名单

登录签发时 payload 加 `jti`。登出：

```ts
await redis.set(`jwt:bl:${jti}`, '1', 'EX', remainSeconds);
```

`JwtStrategy.validate` 里若 key 存在则 401。

### 验收

第一次查详情走数据库，第二次在 ttl 内应更快；更新后再查是新数据。

---

## 步骤 2：文件上传

### 目的

头像等文件落到磁盘（或以后换 OSS），路径写入用户表。

### 改 schema

```prisma
model User {
  // ...
  avatar String?
}
```

```bash
npx prisma migrate dev --name add_user_avatar
```

### 安装

```bash
pnpm add multer
pnpm add -D @types/multer
```

`@nestjs/platform-express` 已在项目中，FileInterceptor 可直接用。

### 接口

```ts
@Post('avatar')
@UseInterceptors(
  FileInterceptor('file', {
    dest: './uploads/avatars',
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
      cb(ok ? null : new Error('只允许 jpg/png/webp'), ok);
    },
  }),
)
uploadAvatar(
  @CurrentUser('id') userId: number,
  @UploadedFile() file: Express.Multer.File,
) {
  if (!file) throw new BadRequestException('请上传文件');
  return this.usersService.updateAvatar(userId, `/uploads/avatars/${file.filename}`);
}
```

静态访问：

```ts
app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
```

这是 Express 层路径，不一定走全局前缀 `/api`。文档里写清楚实际 URL。

`uploads/` 加入 `.gitignore`。生产应换对象存储，本地磁盘不好扩、不好备份。

### 验收

用 Swagger 选文件上传，用户 `avatar` 字段有值，浏览器能打开该 URL。超 2MB 或上传 txt 应失败。

---

## 步骤 3：数据库事务

### 目的

多条写操作要么全成功，要么全失败。

例：批量删除用户并写操作日志（若你加了 `Log` 表）：

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.user.deleteMany({ where: { id: { in: ids } } });
  await tx.auditLog.create({
    data: { action: 'BATCH_DELETE_USER', payload: JSON.stringify(ids) },
  });
});
```

`tx` 和 `prisma` 用法相同，但必须用 `tx`，否则那条语句不在事务里。

交互式事务有超时，默认约 5 秒。批量很大时用 `deleteMany` 一次完成，不要循环 `delete`。

顺序固定、没有中间业务判断时，也可用数组形式：

```ts
await this.prisma.$transaction([
  this.prisma.user.update({ ... }),
  this.prisma.user.update({ ... }),
]);
```

### 验收

故意让第二步失败（错误字段），确认第一步没有提交。

---

## 步骤 4：软删除

### 目的

删除变成「标记删除」，数据还在，可恢复、可审计。

```prisma
model User {
  // ...
  deletedAt DateTime? @map("deleted_at")
}
```

```bash
npx prisma migrate dev --name add_user_deleted_at
```

查询默认排除已删：

```ts
const notDeleted = { deletedAt: null };

findMany({ where: { ...where, ...notDeleted } })
findFirst({ where: { id, ...notDeleted } })
```

删除：

```ts
await this.prisma.user.update({
  where: { id },
  data: { deletedAt: new Date() },
});
```

注意：

- `@unique` 的 email 在软删后仍占用。若允许「删了再注册同一邮箱」，需把唯一索引改成 `(email, deletedAt)` 或删除时把 email 改成 `old+时间戳`。
- JWT 对应用户被软删后，`validate` 里按 `deletedAt: null` 查不到，应 401。
- 缓存 key 也要删。

真正物理删除可留给管理员定时任务。

---

## 步骤 5：定时任务

```bash
pnpm add @nestjs/schedule
```

`AppModule`：

```ts
import { ScheduleModule } from '@nestjs/schedule';

imports: [ScheduleModule.forRoot(), ...]
```

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeSoftDeleted() {
    const deadline = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.user.deleteMany({
      where: { deletedAt: { lt: deadline } },
    });
    this.logger.log(`物理删除软删用户 ${result.count} 条`);
  }
}
```

多实例部署时，每个进程都会跑 Cron，任务可能重复。生产要用分布式锁（Redis SET NX）或单机跑 worker。学习阶段单进程即可。

---

## 步骤 6：接口限流

防止登录被刷、接口被打满。

```bash
pnpm add @nestjs/throttler
```

```ts
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60_000, limit: 20 }],
}),

providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
],
```

登录更严：

```ts
@Public()
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@Post('login')
login() {}
```

超限返回 429。有 Redis 后，Throttler 可配 Redis 存储，多进程额度才共享。默认内存存储只对当前进程有效。

---

## 步骤 7：单元测试

项目已有 Vitest：`pnpm test`。

测 Service，不启动 HTTP，mock 掉 Prisma。

`src/users/users.service.spec.ts` 思路：

```ts
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('邮箱重复时抛 ConflictException', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 1 });
    await expect(
      service.create({
        username: 'tom',
        email: 'tom@test.com',
        password: '123456',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
```

先测分支：成功创建、重复冲突、找不到用户。不要追求覆盖率数字。

---

## 步骤 8：E2E 测试

`pnpm test:e2e` 已配置。E2E 走真实 HTTP，应用 `AppModule`。

`test/auth.e2e-spec.ts` 流程示例：

1. `POST /api/auth/register`
2. `POST /api/auth/login` 拿到 token
3. `GET /api/auth/profile` 带 `Authorization: Bearer ...`
4. 不带 token 访问应 401

用 `supertest`：

```ts
const res = await request(app.getHttpServer())
  .post('/api/auth/login')
  .send({ username: 'tom', password: '123456' })
  .expect(201); // 或 200，看你的 @HttpCode
```

E2E 需要数据库。学习阶段可用单独的 `DATABASE_URL` 指向 `init_xue_test`，跑前 `prisma migrate deploy`。不要对着开发库乱删数据。

---

## 步骤 9：Docker 部署

`project/Dockerfile` 思路：

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate && pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

`docker-compose.yml`：

```yaml
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: example
      MYSQL_DATABASE: init_xue
    ports:
      - "3306:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine

  app:
    build: .
    env_file: .env
    environment:
      DATABASE_URL: mysql://root:example@mysql:3306/init_xue
      REDIS_HOST: redis
    ports:
      - "3000:3000"
    depends_on:
      mysql:
        condition: service_healthy
```

容器里主机名是服务名 `mysql`，不要再写 `localhost`。

---

## 步骤 10：生产环境配置

### 健康检查 `GET /api/health`

```ts
@Public()
@Get('health')
async health() {
  await this.prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', time: new Date().toISOString() };
}
```

Docker / Nginx / 负载均衡用它判断实例是否活着。数据库挂了应返回 503。

### 环境变量

| 变量 | 生产注意 |
| --- | --- |
| `NODE_ENV=production` | 少打 debug，部分库会关闭详细错误 |
| `JWT_SECRET` | 足够长，且与开发环境不同 |
| `DATABASE_URL` | 最小权限账号，不要用 root |

### 安全

```bash
pnpm add helmet
```

```ts
import helmet from 'helmet';
app.use(helmet());
app.enableCors({ origin: ['https://your-frontend.com'] });
```

生产关闭 Swagger，或加账号保护：

```ts
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('docs', app, document);
}
```

过滤器里：生产不把 `stack` 返回给客户端，只写日志。

### 日志

用 Nest `Logger` 或 JSON 日志，不要 `console.log`。请求日志不要打印密码、token。

---

## 第五阶段总验收

- [ ] 缓存命中后仍能更新失效
- [ ] 上传类型和大小有限制
- [ ] 事务失败会回滚
- [ ] 软删后列表不可见，登录失败
- [ ] 登录接口连刷会 429
- [ ] `pnpm test`、`pnpm test:e2e` 能过
- [ ] `GET /api/health` 正常
- [ ] compose 能拉起 app + mysql（+ redis）

回到 [README.md](./README.md) 可按阶段复习。
