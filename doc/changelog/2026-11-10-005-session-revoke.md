# CHG-20261110-005：退出与修改密码

- 日期：2026-11-10（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。退出和修改密码已本地 HTTP 验收；重置和阶段 05 整体未完成

## 背景与原因

刷新已经能轮换单次凭据。退出如果只让客户端丢掉 Access，服务端会话仍然有效。修改密码也必须让该用户已经发出的 Access 和 Refresh 立即失效。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- `project/prisma/migrations/20261110164600_add_user_token_version/migration.sql`
- `project/src/modules/auth/auth.service.ts`
- `project/src/modules/auth/auth.controller.ts`
- `project/src/modules/auth/guards/jwt-auth.guard.ts`
- `project/src/modules/auth/dto/change-password.dto.ts`
- `project/src/modules/auth/types/authenticated-user.ts`
- `project/src/modules/users/user.select.ts`
- [阶段 05](../05-authentication/implementation.md)
- [阶段 02](../02-database/implementation.md)

`prisma generate` 更新了本地 Prisma Client。验收脚本只在本次执行，未保留。

## 具体变更

`users` 增加 `token_version`，现有行默认为 0。Access 增加整数声明 `ver`。Guard 要求它等于用户当前版本，并把 `{ id, sessionId, tokenVersion }` 挂到请求上。公开响应不返回该字段。没有 `ver` 的旧 Access 返回 401。

`POST /auth/logout` 只撤销当前会话。`POST /auth/logout-all` 和 `PATCH /auth/password` 把版本加一，并撤销该用户全部未撤销会话。改密的新哈希在事务外计算；事务内原哈希或版本已经变化时返回 409。原密码错误返回 401「原密码错误」。登录、刷新、退出和改密都先锁用户行。

用户资料接口仍不修改状态，删除仍是硬删除。本批没有新增禁用或软删。

## 兼容性影响

已签发且不含 `ver` 的 Access 会变为 401，需要重新登录。当前退出不影响其它会话。全部退出和修改密码会使该用户全部旧凭据失效。

## 数据库影响

迁移 `20261110164600_add_user_token_version` 只增加一列，默认 0。没有 reset，没有改写已应用迁移。应用后库相对 Schema 的 diff 为空。回滚时可删除该列；已提升过的版本无法靠删列恢复旧 Access。本次未执行回滚。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1。工作目录 `project/`。`tsc --noEmit -p tsconfig.build.json` 与改动文件 ESLint 退出码 0。

`prisma migrate deploy` 应用上述迁移。随后重启 `pnpm run start`。临时用户 `verify-revoke-20261110` 使用文档中的测试密码，验收后删除。`node --env-file=.env scripts/verify-session-revoke.mjs` 退出码 0。输出不含 token、密码或连接串。

- 两次登录都是 200，Access 含 `ver`。退出当前会话后，该 Access 和 Refresh 为 401，另一次登录仍是 200。
- 全部退出后，剩余 Access 和 Refresh 为 401。
- 原密码错误为 401，新密码过短为 400。改密成功为 200 且 `Cache-Control: no-store`。旧 Access、旧 Refresh 和旧密码登录为 401，新密码登录为 200。
- 并行修改为一次 200、一次 409，两个新密码只有一个能登录。

未覆盖禁用、软删、数据库 503 和不含 `ver` 的旧 Access。

## 关联文档

[阶段 05 第 5 节与第 8 节](../05-authentication/implementation.md)、[ADR 0004](../decisions/0004-security-and-data-policy.md)。
