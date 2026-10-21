# 阶段 02：数据库与 Prisma 集成

更新：2026-10-21。文档状态：已编写；功能状态：计划中。前置：[01](../01-initialization/implementation.md)。命令默认在 `project/`；安装、建库、迁移全部是后续用户实施动作。

## 1. 阶段目标

使用 MySQL8.4 和精确匹配的 Prisma7.10.1 CLI/Client/adapter，完成可构建的数据库模块、User 初始模型、增量迁移、连接关闭和事务基础。不提供用户 HTTP 接口。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| MySQL 环境/账户 | 隔离开发数据与权限 | P0 | Docker或外部DB | 确认版本、专用库、runtime/migrator权限 |
| Prisma7配置 | 保证 CLI/运行时同一数据库 | P0 | ESM/配置校验 | validate/generate/build均成功 |
| PrismaModule/Service | 单连接池生命周期 | P0 | adapter | 启动连通、停止释放连接 |
| User模型/迁移 | 后续用户认证基础 | P0 | 业务字段约定 | 空库可重建，唯一/软删索引正确 |
| 事务/异常 | 防部分写入和泄漏 | P0 | PrismaClient | 回滚验证通过，03能映射已知错误 |

## 3. 技术原理

Prisma Schema 描述模型，Migrate 生成可审阅 SQL；generate 输出类型化客户端，它不替代迁移。Prisma7 使用数据库驱动适配器，MySQL 使用 PrismaMariaDb，连接池由驱动管理。Nest 的单例 Provider 只建一个客户端，onModuleInit 连接，onModuleDestroy 断开，配合01的 shutdown hooks。

数据库 URL 供 CLI 使用；运行时将同一 URL 映射为 adapter 参数。Schema不再混写旧版 URL，CLI配置显式加载 dotenv。迁移工具不经过 Nest ConfigModule，所以两条路径都必须验证配置。参考 [Prisma7 MySQL](https://www.prisma.io/docs/v7/prisma-orm/quickstart/mysql)、[生成器](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)。

## 4. 实现前准备

先确认 MySQL 是否已存在、是否有数据、地址和版本；不得在未知库上 init/reset。本地服务未核实，可复用经确认的8.4服务或后续手动创建开发容器。DB使用 InnoDB/utf8mb4，时间按UTC；runtime仅DML，迁移账户具备DDL，开发shadow数据库单独配置且不指向业务库。

后续安装：

```bash
pnpm add -DE prisma@7.10.1
pnpm add --save-exact @prisma/client@7.10.1 @prisma/adapter-mariadb@7.10.1
pnpm exec prisma --version
```

dotenv18.0.8已存在，无需重复引入；adapter已包含驱动依赖，应用不直接调用驱动时不额外添加 mariadb。配置示例只维护 `DATABASE_URL="mysql://app_user:replace_me@127.0.0.1:3306/init_xue_dev"`；密码需URL编码，不能提交真实值。数据库名称/账户创建流程见 [10](../10-deployment/implementation.md)，只在确认隔离库后执行。

## 5. 详细实施步骤

### 5.1 确认连接与权限边界

- 目标：清楚目标库，避免把开发迁移指向生产。
- 文件：修改 `project/.env.example`、`project/src/config/env.validation.ts`；真实配置由用户写本机 .env。
- 操作：数据库阶段启用后 DATABASE_URL 必填，校验 protocol=mysql、host、非空库名、整数端口；删除 example 中相互漂移的 DATABASE_HOST/USERNAME等冗余键。生产要求 TLS，单独CA路径不是第二份连接凭据。将 migrator URL 仅提供给迁移作业；runtime和迁移使用同一键名但不同账户。
- 命令：在用户确认可连接后，用交互式密码客户端执行只读 `SELECT VERSION(), DATABASE(), @@character_set_database, @@collation_database, @@time_zone;`，不把密码放命令参数或日志。无客户端可在已确认的容器通过 `docker compose exec mysql mysql -u 用户 -p` 查询。
- 预期/验证：版本8.4.x、库名准确、字符集utf8mb4；runtime不能CREATE/DROP，迁移账户可DDL，shadow库与业务库完全分离。此处不需要默认创建root远程账户。

### 5.2 初始化 Prisma7 的专用配置与生成器

- 目标：CLI配置、源码、编译产物形成一致链路。
- 文件：新建 `project/prisma7.config.ts`、`project/prisma/schema.prisma`，修改 package scripts 与ignore。
- 操作：确认不存在历史 schema 后手动创建；如果使用CLI初始化，只调用已安装CLI `pnpm exec prisma init --datasource-provider mysql --output ../src/generated/prisma`，已有.env时先保留内容，不覆盖。

```ts
// project/prisma7.config.ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
```

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../src/generated/prisma"
  moduleFormat           = "esm"
  generatedFileExtension = "ts"
  importFileExtension    = "js"
}
datasource db {
  provider = "mysql"
}
```

- 命令：添加第6节模型后 `pnpm exec prisma validate --config prisma7.config.ts`、`pnpm exec prisma generate --config prisma7.config.ts`；新增 `prisma:generate` script，build改为 `pnpm run prisma:generate && nest build`。
- 预期/验证：生成于src/generated/prisma，构建后出现dist/generated/prisma/client.js。不要把项目rootDir改到仓库根绕过导入错误；生成物不入库，migrations必须入库。

### 5.3 创建数据库单例 Provider

- 目标：Nest DI管理客户端与关闭。
- 文件：新建 `project/src/infrastructure/database/database-options.ts`、`prisma.service.ts`、`prisma.module.ts`，修改 AppModule。
- 操作：database-options读取经验证URL，仅允许已支持的选项，明确拒绝静默丢弃的query参数。普通本地连接核心映射如下（生产TLS额外按10节配置）：

```ts
const url = new URL(databaseUrl);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  connectionLimit: 5,
});
```

```ts
// project/src/infrastructure/database/prisma.service.ts
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createDatabaseAdapter } from './database-options.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ adapter: createDatabaseAdapter(config.getOrThrow<string>('DATABASE_URL')) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

- 解释：createDatabaseAdapter 将上面的映射封装为函数，并导入 `PrismaMariaDb`；不接受外部传来的任意 URL。PrismaModule声明providers `[PrismaService]`、exports `[PrismaService]`，需要DB的业务模块显式imports PrismaModule；不要每请求new client或注册多份Provider。
- 命令：`pnpm run build`，DB可用后 `pnpm start:dev`，构建产物测试 `node dist/main.js`。
- 预期/验证：启动连接失败应阻断就绪；停止后数据库连接数回落。检查Node直接运行，而不只看TS编辑器无报错。

### 5.4 生成、审阅与应用初始迁移

- 目标：以SQL为可审阅的数据变更历史。
- 文件：`project/prisma/schema.prisma`、`project/prisma/migrations/<时间>_init_user/migration.sql`；验证记录写本阶段与changelog。
- 操作：采用第6节模型；开发库确认隔离且可回滚后才生成。初始库collation选 `utf8mb4_0900_ai_ci`；用户名限定小写ASCII，邮箱按本项目规则trim/lowercase，不把URL编码误当身份归一化。唯一性最终由数据库约束兜底。
- 命令（会写库）：`pnpm exec prisma migrate dev --name init_user --create-only --config prisma7.config.ts`；审阅SQL后 `pnpm exec prisma migrate dev --config prisma7.config.ts`；再generate。create-only也可能访问/修改开发shadow库，遇到reset提示立即停止。
- 预期/验证：隔离空库 `migrate deploy` 可从零重建；两次插入同账号第二次触发唯一约束；迁移文件不包含无关DROP。不要自动覆盖已有非空数据库，已有表需先调研baseline并另写ADR。

### 5.5 验证事务与错误边界

- 目标：掌握一致性，给03提供错误类型来源。
- 文件：后续新建 `project/test/database.integration-spec.ts`，数据库模块不直接绑定HTTP错误码。
- 操作：测试中用 `$transaction(async tx => { ... })` 插入两条相同username，断言整体回滚；业务Repository将来接受 `Prisma.TransactionClient`，不能在tx里调用另一个裸PrismaService写入。唯一异常由03映射409；驱动/连接异常在内部脱敏记录并输出503/500，不能把所有驱动错误归为唯一冲突。
- 命令：按09隔离数据库集成测试命令执行；正常断开、错误凭据、DB不可用各测一次。禁止对开发共享库运行清理脚本。
- 预期/验证：回滚后无第一条残留记录；SIGTERM释放连接；P2002/P2025等来自此版生成client，采用instanceof与unknown收窄，不断言任何error都具有code。

## 6. 数据库设计

初始表 `users`：Int自增PK；username/email唯一（含软删记录仍保留），status+deletedAt+id组合索引用于列表；外键在05/06增量增加。时间为UTC DateTime(3)。不设Role枚举锁死扩展。

```prisma
enum UserStatus {
  PENDING
  ACTIVE
  DISABLED
}
model User {
  id                Int        @id @default(autoincrement())
  username          String     @unique @db.VarChar(32)
  email             String     @unique @db.VarChar(254)
  passwordHash      String?    @map("password_hash") @db.VarChar(255)
  nickname          String?    @db.VarChar(64)
  status            UserStatus @default(PENDING)
  tokenVersion      Int        @default(0) @map("token_version")
  permissionVersion Int        @default(0) @map("permission_version")
  deletedAt         DateTime?  @map("deleted_at") @db.DateTime(3)
  createdAt         DateTime   @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt         DateTime   @updatedAt @map("updated_at") @db.DateTime(3)

  @@index([status, deletedAt, id])
  @@map("users")
}
```

passwordHash可空只为管理端先建PENDING资料；不能用空字符串或明文占位，登录必须要求非空哈希+ACTIVE+未删除。tokenVersion用于撤销，permissionVersion预留权限变更版本；业务写入时由服务管理，不允许客户端指定。nickname的null含义为清空；API白名单见04。MySQL可空唯一键不能用`@@unique([email,deletedAt])`实现活跃唯一，否则NULL允许重复；本方案永久保留唯一身份，见 [ADR0004](../decisions/0004-security-and-data-policy.md)。

迁移只增量追加；回滚初始空测试库可重建，含真实数据的生产通过前向修复/备份恢复，不能运行migrate reset。`@updatedAt`由Prisma更新，绕过Prisma的SQL需手工维护更新时间。

## 7. API 设计

本阶段无新增业务API，沿用01存活接口。数据库连通性在集成测试中验证，08再提供受控就绪探针；不得新增任意SQL调试HTTP接口。

## 8. 验收标准

- [ ] 三个Prisma包精确7.10.1，validate/generate/build成功。
- [ ] CLI与runtime连接同一目标库，密码特殊字符被正确解析。
- [ ] 审阅迁移后，在确认过的隔离空库deploy成功；索引/字段/默认值符合Schema。
- [ ] 唯一约束、事务回滚、连接失败与关闭验证通过。
- [ ] Node直接运行dist成功；生产TLS和专用账户要求已记录。

验收记录：未执行。MySQL实际版本、账户权限和连通性待用户确认；本次无数据库操作。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| prisma没有generate/migrate dev | 可能误装Prisma8 CLI；查版本与锁文件，精确锁7，不运行无版本npx |
| PrismaClient必须传adapter | 使用PrismaMariaDb，不能混入无adapter旧示例 |
| CLI有env、应用无env或反之 | CLI dotenv与Nest加载独立；检查工作目录和两条配置路径 |
| `.ts`/`.js`生成导入报错 | 检查generator的扩展与NodeNext，重新generate再build |
| migrate要求reset | 停止；核实历史、漂移和备份，未经确认不重置 |
| MySQL8.4身份认证失败 | 查驱动/TLS/账户认证插件，不能为旧教程降级为不安全认证 |

## 10. 后续扩展

[03](../03-api-standards/implementation.md) 统一映射数据库异常；[04](../04-user-management/implementation.md) 围绕User实现查询/软删；05增加会话和密码重置，06增加角色关联，均为增量迁移。连接池容量按应用副本数×每副本连接数与DB容量评估后调整。
