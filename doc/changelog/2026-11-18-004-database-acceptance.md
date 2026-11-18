# CHG-20261118-004：阶段 02 本地只读验收

- 日期：2026-11-18（Asia/Shanghai）
- 变更类型：核对
- 文档状态：已更新
- 功能状态：进行中。版本、迁移状态、构建和启动已核对；阶段 02 不能标为已验证

## 背景与原因

阶段 02 的验收项一直空着，导航仍写七份迁移。这次只做不改库的核对，把已经能证明的项勾上，其余保持未验收。

## 涉及模块与文件

- `doc/02-database/implementation.md`
- `doc/README.md`
- `doc/00-overview/roadmap.md`
- `doc/00-overview/project-overview.md`

没有改应用代码、Schema 或迁移 SQL。`pnpm run build` 重新生成了 Prisma Client，工作区没有因此出现新的源码差异。

## 具体变更

阶段 02 勾上三项：三个 Prisma 包均为 7.10.1 且 validate/generate/build 成功；CLI 与运行时使用同一个 `DATABASE_URL`，示例密码中的特殊字符可被解码；`node dist/main.js` 能启动。隔离空库 deploy、唯一约束、事务回滚、连接失败和优雅关闭保持未勾选。

## 兼容性影响

没有 API、配置或依赖变化。CLI 提示可升级到 Prisma 8，本次没有升级。

## 数据库影响

只读。没有 `migrate deploy`、`migrate dev`、reset 或 drop。本地库 `nestjs_new_db` 的九份迁移已是最新，相对 Schema 的 diff 为空。

## 验证方式与结果

环境：win32 x64、Node 24.22.2、pnpm 11.13.1、Prisma CLI、`@prisma/client`、`@prisma/adapter-mariadb` 均为 7.10.1、TypeScript 6.0.3。目录 `project/`。

- `pnpm exec prisma --version` 退出 0。
- `pnpm exec prisma validate --config prisma7.config.ts` 退出 0。
- `pnpm run build` 退出 0，生成 Prisma Client 7.10.1。
- `pnpm exec prisma migrate status --config prisma7.config.ts` 退出 0：`127.0.0.1:3306` 的 `nestjs_new_db`，九份迁移，数据库已是最新。
- `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --config prisma7.config.ts --exit-code` 退出 0，无差异。
- 只读查询：MySQL 8.4.10，字符集 utf8mb4，库默认排序规则 utf8mb4_0900_ai_ci，`time_zone` 为 SYSTEM。`users`、`roles` 的表排序规则是 utf8mb4_unicode_ci。没有记录账户或密码。
- 运行时解析器用示例地址确认 `%40`、`%3A` 会解成 `@`、`:`，并用同一个 `DATABASE_URL` 连上该库。
- `node dist/main.js` 启动后，`GET /api/v1/health/live` 与 `GET /api/v1/health/ready` 均返回 200。进程随后被强制结束，不能当作优雅关闭通过。本次连接没有 TLS，也没有探测账户是否禁止 DDL。

## 关联文档

- [阶段 02 第 8 节](../02-database/implementation.md)
