# CHG-20261111-001：登录失败限制

- 日期：2026-11-11（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。登录失败限制已本地 HTTP 验收；重置和阶段 05 整体未完成

## 背景与原因

登录、刷新、退出和改密已经可用，但登录尝试没有次数上限。阶段 05 约定在接入 Redis 之前，先用 MySQL 固定窗口挡住暴力尝试。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- `project/prisma/migrations/20261111151500_add_auth_attempt_bucket/migration.sql`
- `project/src/modules/auth/login-limit.service.ts`
- `project/src/modules/auth/auth.service.ts`
- `project/src/modules/auth/auth.controller.ts`
- `project/src/modules/auth/auth.module.ts`
- `project/src/common/exceptions/attempt-limited.exception.ts`
- `project/src/common/filters/all-exceptions.filter.ts`
- `project/src/config/env.validation.ts`
- `project/src/config/env.validation.spec.ts`
- `project/.env.example`
- `project/test/setup-env.ts`
- [阶段 05](../05-authentication/implementation.md)
- [阶段 02](../02-database/implementation.md)

本地 `.env` 增加了 `AUTH_LIMIT_HMAC_SECRET`。密钥没有写入文档或变更记录。验收脚本只在本次执行，未保留。

## 具体变更

新增 `auth_attempt_buckets`。`POST /api/v1/auth/login` 在密码哈希前，用 HMAC 分别为用户名和直接连接地址占用一次。默认同一用户名 15 分钟 10 次，同一地址 1 分钟 60 次。超过后返回 429「尝试过于频繁」，并带 `Retry-After`。成功登录不减少次数。数据库故障返回 503，不继续核对密码。

地址只取 `socket.remoteAddress`，不读取 `X-Forwarded-For`。每次登录最多删除 100 条已到期记录。

## 兼容性影响

新增必填配置。缺省时进程不能启动。同一用户名在 15 分钟内第 11 次登录会得到 429，即使密码正确。刷新、退出和改密不受这个计数影响。

## 数据库影响

迁移 `20261111151500_add_auth_attempt_bucket` 只新建表。没有 reset，没有改写已应用迁移。应用后库相对 Schema 的 diff 为空。回滚时可删除该表。本次未执行回滚。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1。工作目录 `project/`。`tsc --noEmit -p tsconfig.build.json`、改动文件 ESLint 和 `env.validation` 单元测试退出码 0，后者 47 项通过。

`prisma migrate deploy` 应用上述迁移。随后重启 `pnpm run start`。临时用户 `verify-limit-seq-20261111` 与 `verify-limit-par-20261111` 使用文档中的测试密码，验收后删除。`node --env-file=.env scripts/verify-login-limit.mjs` 退出码 0。输出不含 token、密码、HMAC 或连接串。

- 同一用户名第 1 次正确登录为 200，随后 9 次错误密码为 401。第 11 次即使密码正确也是 429，`Retry-After` 为正整数。
- 另一个用户名并行 15 次错误登录：10 次 401，5 次 429。

未覆盖来源地址每分钟 60 次、数据库 503 和到期清理。

## 关联文档

[阶段 05 第 5 节与第 8 节](../05-authentication/implementation.md)、[ADR 0004](../decisions/0004-security-and-data-policy.md)。
