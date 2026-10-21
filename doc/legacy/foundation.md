> 历史归档（2026-10-21），原位置：`doc/01-基础架构.md`。以下保留旧方案用于追溯，其中版本、阶段、状态与代码示例可能过时；当前实施请从 [文档导航](../README.md) 开始。

# 第一阶段：项目初始化与基础架构

目标：应用能启动、能读环境变量、能连 MySQL、有用户表、接口统一走 `/api`、能打开 Swagger。

## 要搞懂什么

- NestJS 请求路径：`main.ts` 创建应用 → `AppModule` 组装模块 → Controller 收 HTTP → Service 写逻辑。
- `@Module()` 的 `imports / controllers / providers` 分别做什么。
- 为什么数据库连接串要放 `.env`，Prisma 为什么只认 `DATABASE_URL`。
- Migration 和 `prisma generate` 的区别。

---

## 步骤 1：NestJS 项目初始化

**状态：已完成。**

### 目的

有一个可运行的 Nest 应用，先摸清入口和目录。

### 现有关键文件

| 文件 | 作用 |
| --- | --- |
| `src/main.ts` | 启动入口，创建 HTTP 服务并 listen |
| `src/app.module.ts` | 根模块，注册控制器、服务、其它模块 |
| `src/app.controller.ts` | 处理路由，例如 `GET /` |
| `src/app.service.ts` | 具体业务，被 Controller 注入 |
| `package.json` | `"type": "module"` 表示 ESM |

### 启动

```bash
pnpm install
pnpm start:dev
```

浏览器打开 `http://localhost:3000`，应看到 `Hello World!`。

### 复习：依赖注入

```ts
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
}
```

你没有 `new AppService()`。Nest 根据 `AppModule.providers` 创建实例，再注入构造函数。后面 Users、Prisma 都是同一套机制。

### 复习：为什么 import 要写 `.js`

```ts
import { AppModule } from './app.module.js';
```

TypeScript 编译后变成 `.js`。`module: nodenext` 要求 import 路径按运行时写，所以源码里也要 `.js`。漏写会导致 `ERR_MODULE_NOT_FOUND`。

---

## 步骤 2：环境变量配置

**状态：已完成。** `ConfigModule` 已在 `app.module.ts` 里全局注册。

### 目的

端口、数据库账号不写死在代码里，换机器只改 `.env`。

### 已有代码

```ts
ConfigModule.forRoot({
  isGlobal: true,       // 其它模块不用再 import ConfigModule
  envFilePath: '.env',  // 从项目根目录读
});
```

`isGlobal: true` 之后，任意 Service 都可以注入 `ConfigService`：

```ts
constructor(private readonly config: ConfigService) {}

const port = this.config.get<number>('PORT');
```

### 操作

```bash
cp .env.example .env
```

编辑 `.env`（示例）：

```env
PORT=3000

DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USERNAME=root
DATABASE_PASSWORD=your_password
DATABASE_NAME=init_xue
DATABASE_URL="mysql://root:your_password@localhost:3306/init_xue"
```

密码若含 `@`、`#`、`/` 等特殊字符，必须做 URL 编码，否则 Prisma 会解析失败。

### 注意

- `.env` 已在 `.gitignore`，不要提交真实密码。
- 改 `.env` 后要重启 `pnpm start:dev`，Nest 不会热更新环境变量。
- Prisma **只读** `DATABASE_URL`，`DATABASE_HOST` 等字段是给你自己或以后手写连接用的。

### 验收

`main.ts` 里 `process.env.PORT` 能读到 `3000`。

---

## 步骤 3：MySQL 数据库连接

### 目的

本机有一个空库，给 Prisma 用。

### 操作

1. 启动 MySQL。
2. 登录后执行：

```sql
CREATE DATABASE init_xue CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. 用同一套账号测一下：

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p init_xue
```

能进去就算连通。库名、账号、密码必须和 `.env` 里 `DATABASE_URL` 一致。

### 常见错误

| 现象 | 原因 |
| --- | --- |
| `Access denied` | 用户名或密码错 |
| `Unknown database` | 没建库，或库名和 URL 不一致 |
| `Can't connect to MySQL server` | MySQL 没启动，或端口不是 3306 |

---

## 步骤 4：Prisma ORM 集成

### 目的

用 TypeScript 操作 MySQL，不手写一堆 SQL。Prisma 根据 `schema.prisma` 生成类型安全的客户端。

### 4.1 安装并初始化

```bash
pnpm add @prisma/client
pnpm add -D prisma
npx prisma init
```

生成：

- `prisma/schema.prisma`：数据模型
- `.env` 里若还没有 `DATABASE_URL`，Prisma 会补一行（本项目已有，核对即可）

### 4.2 改数据源为 MySQL

编辑 `prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

`env("DATABASE_URL")` 从 `.env` 读取，不要把密码写进 schema。

### 4.3 封装 PrismaService

不要在每个 Service 里 `new PrismaClient()`，否则连接数会爆。做成全局 Nest 服务，应用启动连库、关闭断库。

```bash
mkdir -p src/prisma
```

`src/prisma/prisma.service.ts`：

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

要点：

- `extends PrismaClient`：继承后可直接 `this.user.findMany()`。
- `OnModuleInit`：模块初始化时连库。
- `OnModuleDestroy`：进程退出时断开，避免连接泄漏。

`src/prisma/prisma.module.ts`：

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

`@Global()`：Users、Auth 都要用数据库，做成全局模块后不用每个业务模块都 `imports: [PrismaModule]`。

`exports`：不 export 的话，别的模块注入不到 `PrismaService`。

### 4.4 挂到根模块

`src/app.module.ts` 的 `imports` 增加：

```ts
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ObserveModule.forRoot({ /* 原有配置 */ }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### 验收

`pnpm start:dev` 无报错。若 `DATABASE_URL` 错误，会在 `$connect()` 时失败。

---

## 步骤 5：Prisma 数据模型

### 目的

用 schema 描述 `users` 表。第二阶段 CRUD、第四阶段登录都用这张表，字段一次设计到位。

### 完整 schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

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

### 字段说明

| 写法 | 含义 |
| --- | --- |
| `@id @default(autoincrement())` | 主键，自增 |
| `@unique` | 唯一索引，重复插入会报 `P2002` |
| `String?` | 可空，对应 TypeScript `string \| null` |
| `@default(ACTIVE)` | 插入时不传则用默认值 |
| `@updatedAt` | 每次 update 自动刷新 |
| `@map("created_at")` | 数据库列名是下划线，代码里仍用驼峰 |
| `@@map("users")` | 表名是 `users`，模型名仍是 `User` |

第二阶段接口先不暴露 `password`、`role`，但表里要有，第四阶段才不用再改结构。

---

## 步骤 6：数据库迁移

### 目的

把 schema 变成 MySQL 里真实的表，并生成 TypeScript 客户端。

### 命令

```bash
npx prisma migrate dev --name init_user
```

做了三件事：

1. 对比 schema 和现有库，生成 SQL，放到 `prisma/migrations/<时间>_init_user/`。
2. 在 MySQL 执行这些 SQL（建表、建索引、建枚举）。
3. 执行 `prisma generate`，生成 `node_modules/.prisma/client`。

以后改 schema，再跑一次并换新名字：

```bash
npx prisma migrate dev --name add_user_avatar
```

只生成客户端、不跑迁移（CI 或客户端丢失时）：

```bash
npx prisma generate
```

生产环境只应用已有迁移、不新建：

```bash
npx prisma migrate deploy
```

### 可视化检查

```bash
npx prisma studio
```

浏览器打开后应能看到 `User` 表。

### 常见错误

| 现象 | 处理 |
| --- | --- |
| `P1001 Can't reach database` | 检查 MySQL 是否启动、`DATABASE_URL` 对不对 |
| `P1017 Server has closed the connection` | 账号权限或库不存在 |
| 改了 schema 但代码没新字段 | 忘记 `migrate` / `generate`，重启一下 TS 服务 |
| 手动在 MySQL 改过表 | 与 migration 历史不一致，学习阶段建议删库重建，不要手改 |

### 验收

MySQL 中存在 `users` 表，列与 schema 一致；代码里可以出现 `this.prisma.user`。

---

## 步骤 7：统一接口前缀

### 目的

所有业务接口都以 `/api` 开头，和文档路径、前端约定一致。

### 修改 `src/main.ts`

在 `app.listen` **之前**：

```ts
app.setGlobalPrefix('api');
```

完整示例（本步骤先加前缀，下一步再加 Swagger）：

```ts
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`应用启动成功`);
  logger.log(`服务地址: http://localhost:${port}/api`);
}
await bootstrap();
```

### 效果

| 原来 | 现在 |
| --- | --- |
| `GET /` | `GET /api` |
| 以后的用户列表 | `GET /api/users` |

Controller 上写 `@Controller('users')` 即可，不要再写 `api/users`。

### 验收

`http://localhost:3000/` 不再是 Hello World；`http://localhost:3000/api` 才是。

---

## 步骤 8：Swagger 接口文档

### 目的

浏览器里看接口、填参数、发请求，少写 curl。

### 安装

```bash
pnpm add @nestjs/swagger
```

Nest 12 的 Swagger 会带上 OpenAPI 依赖，一般不用再单独装 `swagger-ui-express`。

### 修改 `src/main.ts`

```ts
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NestJS 学习项目')
    .setDescription('用户管理与认证 API')
    .setVersion('1.0')
    .addBearerAuth() // 第四阶段 JWT 会用到，现在加上无影响
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`应用: http://localhost:${port}/api`);
  logger.log(`文档: http://localhost:${port}/api/docs`);
}
await bootstrap();
```

`setGlobalPrefix('api')` 之后，`setup('docs')` 的实际地址是 `/api/docs`。

### 给接口写注解（第二阶段会用）

```ts
@ApiTags('用户')
@Controller('users')
export class UsersController {}

@ApiOperation({ summary: '创建用户' })
@Post()
create(@Body() dto: CreateUserDto) {}
```

DTO 上用 `@ApiProperty()` 后，Swagger 才能显示字段说明。

### 验收

浏览器打开 `http://localhost:3000/api/docs`，能看到 Swagger UI。

---

## 第一阶段总验收

- [ ] `pnpm start:dev` 正常启动
- [ ] `.env` 中 `DATABASE_URL` 可连上 MySQL
- [ ] `users` 表已创建
- [ ] `GET /api` 能访问
- [ ] `GET /api/docs` 能打开文档

做完后进入 [02-用户CRUD.md](users-crud.md)。
