> 历史归档（2026-10-21），原位置：`README.md`。以下保留旧方案用于追溯，其中版本、阶段、状态与代码示例可能过时；当前实施请从 [文档导航](../README.md) 开始。

# NestJS 学习项目

基于 NestJS + Prisma + MySQL 的后端练习项目，按阶段完成用户管理、接口规范、认证权限与工程化。

代码目录：`project/`。下文命令默认在该目录执行。

当前进度：NestJS 项目已创建，`ConfigModule` 与 `.env` 已接入，Prisma / CRUD / 认证尚未开始。

## 技术栈

- **框架**：NestJS 12（ESM，`import` 需带 `.js` 后缀）
- **数据库**：MySQL
- **ORM**：Prisma
- **文档**：Swagger
- **认证**：JWT、Passport、Argon2
- **缓存**：Redis（第五阶段）

## 推荐目录结构

```text
project/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── common/                 # 第三阶段起：拦截器、过滤器、管道
│   ├── prisma/                 # PrismaModule / PrismaService
│   ├── users/                  # 第二阶段：用户 CRUD
│   ├── auth/                   # 第四阶段：登录认证
│   ├── app.module.ts
│   └── main.ts
├── .env
└── .env.example
```

---

## 第一阶段：项目初始化与基础架构

### 1. NestJS 项目初始化

**状态：已完成。**

- 入口：`src/main.ts`
- 根模块：`src/app.module.ts`
- 启动：

```bash
pnpm install
pnpm start:dev
```

浏览器访问 `http://localhost:3000`，应返回 `Hello World!`。

### 2. 环境变量配置

**状态：已完成。**

`src/app.module.ts` 已全局加载 `.env`：

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
});
```

1. 复制示例文件：`cp .env.example .env`
2. 填入本机 MySQL 账号密码和数据库名
3. `.env` 已在 `.gitignore` 中，不要提交

```env
PORT=3000
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USERNAME=root
DATABASE_PASSWORD=your_password
DATABASE_NAME=init_xue
DATABASE_URL="mysql://root:your_password@localhost:3306/init_xue"
```

`DATABASE_URL` 必须能连上，Prisma 只读这一项。

### 3. MySQL 数据库连接

1. 本机安装并启动 MySQL
2. 创建空库：

```sql
CREATE DATABASE init_xue CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. 用客户端或 `mysql` 命令确认能登录

### 4. Prisma ORM 集成

```bash
pnpm add @prisma/client
pnpm add -D prisma
npx prisma init
```

会生成 `prisma/schema.prisma`。把 `datasource` 改成 MySQL：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

封装全局 Prisma 服务，避免到处 `new PrismaClient()`：

```bash
mkdir -p src/prisma
```

新建 `src/prisma/prisma.service.ts`：

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

新建 `src/prisma/prisma.module.ts`：

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

在 `AppModule` 的 `imports` 中加入 `PrismaModule`。

### 5. Prisma 数据模型

在 `prisma/schema.prisma` 中定义用户表（后续认证、角色会复用）：

```prisma
enum UserStatus {
  ACTIVE
  DISABLED
}

enum Role {
  ADMIN
  USER
}

model User {
  id        Int        @id @default(autoincrement())
  username  String     @unique
  email     String     @unique
  password  String
  nickname  String?
  status    UserStatus @default(ACTIVE)
  role      Role       @default(USER)
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  @@map("users")
}
```

说明：第二阶段 CRUD 可以先不暴露 `password` / `role`，但表结构一次建好，第四阶段不用再改库。

### 6. 数据库迁移

```bash
npx prisma migrate dev --name init_user
npx prisma generate
```

- `migrate dev`：生成 SQL 并在 MySQL 中建表
- `generate`：生成 TypeScript 客户端

用 Prisma Studio 检查表：

```bash
npx prisma studio
```

### 7. 统一接口前缀

在 `src/main.ts` 的 `listen` 之前加：

```ts
app.setGlobalPrefix('api');
```

之后所有接口都以 `/api` 开头，例如 `/api/users`。

### 8. Swagger 接口文档

```bash
pnpm add @nestjs/swagger
```

在 `src/main.ts` 中：

```ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('NestJS 学习项目')
  .setDescription('用户管理与认证 API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

启动后访问：`http://localhost:3000/api/docs`

**第一阶段验收：** 应用能启动、能连 MySQL、`users` 表已创建、Swagger 页面能打开。

---

## 第二阶段：用户管理 CRUD（核心）

生成模块：

```bash
npx nest g module users
npx nest g controller users
npx nest g service users
```

ESM 项目里，生成后的 `import` 记得补上 `.js` 后缀。

### 1. 新增用户 `POST /api/users`

`src/users/dto/create-user.dto.ts`：

```ts
export class CreateUserDto {
  username: string;
  email: string;
  password: string;
  nickname?: string;
}
```

`UsersService.create`：

```ts
return this.prisma.user.create({
  data: dto,
  select: { id: true, username: true, email: true, nickname: true, status: true, createdAt: true },
});
```

`select` 用来排除 `password`。

### 2. 用户列表 `GET /api/users`

```ts
return this.prisma.user.findMany({
  select: { id: true, username: true, email: true, nickname: true, status: true, createdAt: true },
});
```

### 3. 分页查询

查询参数：`page`（默认 1）、`pageSize`（默认 10）。

```ts
const skip = (page - 1) * pageSize;
const [list, total] = await Promise.all([
  this.prisma.user.findMany({ where, skip, take: pageSize, orderBy: { id: 'desc' } }),
  this.prisma.user.count({ where }),
]);

return { list, total, page, pageSize };
```

### 4. 条件搜索

同一套 `where`：

```ts
const where = {
  username: username ? { contains: username } : undefined,
  email: email ? { contains: email } : undefined,
  status: status ?? undefined,
};
```

对应查询：`GET /api/users?page=1&pageSize=10&username=tom&status=ACTIVE`

### 5. 用户详情 `GET /api/users/:id`

```ts
const user = await this.prisma.user.findUnique({ where: { id } });
if (!user) throw new NotFoundException('用户不存在');
```

### 6. 修改用户 `PATCH /api/users/:id`

`UpdateUserDto` 所有字段都设为可选。先查是否存在，再 `update`。不要在这里改密码（第四阶段单独做）。

### 7. 删除用户 `DELETE /api/users/:id`

```ts
await this.prisma.user.delete({ where: { id } });
```

不存在时抛 `NotFoundException`。

### 8. 批量删除 `DELETE /api/users/batch`

body：`{ ids: number[] }`

```ts
await this.prisma.user.deleteMany({ where: { id: { in: ids } } });
```

注意：把这条路由写在 `:id` 前面，否则 `batch` 会被当成 id。

### 9. 用户状态管理 `PATCH /api/users/:id/status`

body：`{ status: 'ACTIVE' | 'DISABLED' }`，用 `update` 只改 `status`。

### 10. 唯一性校验

创建 / 更新前先查：

```ts
const exists = await this.prisma.user.findFirst({
  where: {
    OR: [{ email: dto.email }, { username: dto.username }],
    NOT: id ? { id } : undefined,
  },
});
if (exists) throw new ConflictException('用户名或邮箱已存在');
```

也可靠 Prisma 的 `P2002` 唯一约束错误（第三阶段在异常过滤器里统一转 409）。

**本阶段重点：** Controller 只收请求，Service 写业务，Module 做依赖注入。Prisma 至少用到 `create`、`findMany`、`findUnique`、`update`、`delete`、`deleteMany`、`count`。

**第二阶段验收：** 用 Swagger 或 curl 跑通增删改查、分页、搜索、批量删除、启停用；重复邮箱返回冲突；密码不出现在响应里。

---

## 第三阶段：接口规范与数据校验

### 1. DTO 参数校验

```bash
pnpm add class-validator class-transformer
```

示例：

```ts
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(3, 32)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 64)
  password: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}
```

Controller 参数写成 `@Body() dto: CreateUserDto`，类型才会触发校验。

### 2. 全局 ValidationPipe

在 `main.ts`：

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // 去掉 DTO 未声明字段
    forbidNonWhitelisted: true,   // 多余字段直接 400
    transform: true,              // query 字符串转 number
  }),
);
```

### 3. 统一响应格式

拦截器统一包成 `{ code, message, data }`：

```ts
{ code: 0, message: 'ok', data: result }
```

实现 `src/common/interceptors/transform.interceptor.ts`，在 `main.ts` 注册：

```ts
app.useGlobalInterceptors(new TransformInterceptor());
```

分页数据也走 `data`：`{ list, total, page, pageSize }`。

### 4. 全局异常处理

实现 `src/common/filters/http-exception.filter.ts`：

- `HttpException`：用它自带的 status 和 message
- Prisma `P2002`：409，提示字段重复
- Prisma `P2025`：404，记录不存在
- 其它：500，生产环境不要把堆栈返回给前端

响应形状与成功时一致：`{ code, message, data: null }`。

### 5. HTTP 状态码规范

| 场景 | 状态码 |
| --- | --- |
| 参数校验失败 | 400 |
| 未登录 / Token 无效 | 401（第四阶段） |
| 角色不够 | 403（第四阶段） |
| 用户不存在 | 404 |
| 用户名/邮箱重复 | 409 |
| 服务器内部错误 | 500 |

删除成功可用 `204`，或统一 `200` + `data: null`，前后端约定一种即可。

### 6. 请求日志

实现 `src/common/interceptors/logging.interceptor.ts`，记录：方法、路径、耗时、状态。异常过滤器里再打错误日志。

### 7. 数据转换

- 时间：Prisma `DateTime` 会变成 ISO 字符串，可在拦截器里统一格式
- 分页：固定 `{ list, total, page, pageSize }`
- 敏感字段：查询一律 `select` 排除 `password`，不要只靠前端隐藏

**第三阶段验收：** 缺字段 / 邮箱格式错误返回 400；重复邮箱 409；不存在 404；所有接口响应都是 `{ code, message, data }`。

---

## 第四阶段：登录认证与权限管理

```bash
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt argon2
pnpm add -D @types/passport-jwt
npx nest g module auth
npx nest g controller auth
npx nest g service auth
```

`.env` 增加：

```env
JWT_SECRET=换成足够长的随机字符串
JWT_EXPIRES_IN=7d
```

### 1. 用户注册 `POST /api/auth/register`

复用用户表。校验用户名、邮箱唯一后写入。密码先哈希再存。

### 2. 密码加密

```ts
import * as argon2 from 'argon2';

const hash = await argon2.hash(password);
const ok = await argon2.verify(hash, password);
```

库中只存 `hash`，永远不要明文。

### 3. 用户登录 `POST /api/auth/login`

body：`{ username, password }`（也可用 email）。

1. 按用户名查找
2. 没有用户或 `argon2.verify` 失败：统一抛 `UnauthorizedException('用户名或密码错误')`，不要拆开提示
3. `status === DISABLED`：禁止登录
4. 签发 JWT

### 4. JWT Token

`AuthModule`：

```ts
JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get('JWT_SECRET'),
    signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') },
  }),
});
```

payload 建议：`{ sub: user.id, role: user.role }`。登录返回：

```json
{ "accessToken": "...", "tokenType": "Bearer" }
```

### 5. 登录状态验证

实现 `JwtStrategy`（从 `Authorization: Bearer <token>` 取 token，校验后查出用户）。

实现 `JwtAuthGuard`，全局注册或按路由加 `@UseGuards(JwtAuthGuard)`。

公开接口用自定义装饰器 `@Public()`，Guard 里遇到则放行（登录、注册、Swagger）。

### 6. 获取当前用户 `GET /api/auth/profile`

自定义 `@CurrentUser()` 装饰器，从 `request.user` 取值。返回当前用户信息（不含密码）。

### 7. 角色管理

用户表已有 `Role`：`ADMIN` / `USER`。管理员改角色可用 `PATCH /api/users/:id/role`，并限制仅 `ADMIN` 可调。

### 8. 接口权限控制

```ts
@Roles('ADMIN')
@UseGuards(JwtAuthGuard, RolesGuard)
```

`RolesGuard` 读取 handler 上的角色元数据，和 `request.user.role` 比较，不够则 403。

建议：用户 CRUD 的删除、批量删除、改角色仅管理员；查自己资料任意登录用户。

### 9. 修改密码 `PATCH /api/auth/password`

body：`{ oldPassword, newPassword }`。校验旧密码 → 哈希新密码 → `update`。

### 10. 退出登录

JWT 无状态，可选方案：

- 前端丢弃 token（最简单）
- 把 token 的 `jti` 写入 Redis 黑名单，Guard 里拒绝（第五阶段有 Redis 后再做）

本阶段可先做前端丢弃，接口 `POST /api/auth/logout` 返回成功即可。

**第四阶段验收：** 未带 token 访问受保护接口 401；普通用户打管理员接口 403；改密码后旧密码不能再登录。

---

## 第五阶段：进阶与工程化

按需做，不必一次全上。

### 1. Redis 缓存

```bash
pnpm add ioredis @nestjs/cache-manager cache-manager cache-manager-ioredis-yet
```

适合缓存：用户详情、当前用户资料。更新 / 删除用户时删对应 key。退出登录黑名单也可放 Redis。

### 2. 文件上传

```bash
pnpm add @nestjs/platform-express multer
```

`POST /api/users/avatar`，限制图片类型和大小，磁盘或对象存储保存路径，把 URL 写入用户 `nickname` 旁的 `avatar` 字段（需补一次 Prisma 迁移）。

### 3. 数据库事务

批量删除后还要写操作日志时：

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.user.deleteMany({ where: { id: { in: ids } } });
  await tx.log.createMany({ data: ... });
});
```

任一步失败则全部回滚。

### 4. 软删除

给 `User` 加 `deletedAt DateTime?`。查询默认 `where: { deletedAt: null }`；删除改为 `update({ deletedAt: new Date() })`。

### 5. 定时任务

```bash
pnpm add @nestjs/schedule
```

`AppModule` 导入 `ScheduleModule.forRoot()`，用 `@Cron` 清理过期 token 黑名单或软删数据。

### 6. 接口限流

```bash
pnpm add @nestjs/throttler
```

全局例如：60 秒 20 次；登录接口更严，防止刷密码。

### 7. 单元测试

现有脚本：`pnpm test`（Vitest）。

给 `UsersService` 写测试：mock `PrismaService`，覆盖创建成功、邮箱重复、用户不存在。

### 8. E2E 测试

脚本：`pnpm test:e2e`。用 `supertest` 打真实 HTTP：注册 → 登录 → 带 token 拉列表。

### 9. Docker 部署

根目录加 `Dockerfile` + `docker-compose.yml`：`app` + `mysql`（第五阶段再加 `redis`）。应用等 MySQL healthy 后再跑 `prisma migrate deploy` 和 `node dist/main`。

### 10. 生产环境配置

- `NODE_ENV=production`
- 关闭 Swagger 或加访问限制
- 日志用 JSON，不要 `console.log`
- 增加 `GET /api/health`：检查进程和数据库 `$queryRaw\`SELECT 1\``
- CORS、Helmet、隐藏 `X-Powered-By`

**第五阶段验收：** 健康检查可用；限流能挡住刷接口；测试能跑通；compose 能拉起整套服务。

---

## 建议实现顺序

1. Prisma 模型 + 迁移 + `PrismaModule`
2. 全局前缀 + Swagger
3. 用户 CRUD（先能跑通，再补分页搜索）
4. ValidationPipe + 统一响应 + 异常过滤器
5. 注册登录 + JWT Guard + 角色
6. Redis / 上传 / 测试 / Docker

每做完一块，用 Swagger 点一遍，再进入下一块。
