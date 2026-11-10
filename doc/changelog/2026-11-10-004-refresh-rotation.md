# CHG-20261110-004：Refresh 单次轮换

- 日期：2026-11-10（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。刷新切片已本地 HTTP 验收；退出、重置和阶段 05 整体未完成

## 背景与原因

登录已经把 Refresh 摘要写在会话行上。一行只能留一个摘要，覆盖后就无法发现旧令牌被再次使用。刷新轮换需要单独保存每一次摘要。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- `project/prisma/migrations/20261110151500_add_refresh_token/migration.sql`
- `project/src/modules/auth/auth.service.ts`
- `project/src/modules/auth/auth.controller.ts`
- `project/src/modules/auth/dto/refresh-token.dto.ts`
- `project/src/config/env.validation.ts`
- `project/src/config/env.validation.spec.ts`
- `project/.env.example`
- [阶段 05](../05-authentication/implementation.md)
- [阶段 02](../02-database/implementation.md)

`prisma generate` 更新了本地 Prisma Client。验收脚本只在本次执行，未保留。

## 具体变更

新增 `RefreshToken`，映射 `sys_refresh_token`。会话表不改列。登录在同一事务写入会话和第一条未使用记录。`POST /api/v1/auth/refresh` 为公开路由，请求体只收 43 位 base64url。

条件更新要求旧记录未使用且未过期。影响行数为 1 才签发后继令牌，并把会话当前摘要和到期时间改到新值。到期时间不超过会话创建时间加上 `SESSION_MAX_TTL_SECONDS`（默认 2592000，且不得短于 Refresh 有效期）。旧记录已使用或条件更新未命中时，同一事务撤销整段会话，提交后再返回 401。未知、过期、已撤销、禁用和软删只返回 401。数据库故障返回 503。

## 兼容性影响

新增公开接口和可选配置，缺省时按 30 天会话上限启动。已有 Refresh 通过迁移回填，仍可轮换一次。客户端必须串行刷新；并行的另一次请求会使整段会话失效，包括先返回的新令牌。

## 数据库影响

迁移 `20261110151500_add_refresh_token` 只新建表和回填。外键指向 `sys_user_session`，删除会话时级联删除 Refresh 记录。没有 reset，没有改写已应用迁移。应用后库相对 Schema 的 diff 为空。回滚时只删除新表，不删除会话表；本次未执行回滚。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1。工作目录 `project/`。`tsc --noEmit -p tsconfig.build.json`、改动文件 ESLint 和 `env.validation` 单元测试退出码 0，后者 46 项通过。

`prisma migrate deploy` 应用上述迁移。随后重启 `pnpm run start`。临时用户 `verify-refresh-20261110` 使用文档中的测试密码，验收后删除。`node --env-file=.env scripts/verify-refresh.mjs` 退出码 0。输出不含 token、密码或连接串。

- 登录 200，第一条摘要未使用，`Cache-Control: no-store`，`expiresIn=900`。
- 刷新 200。旧摘要已使用，新摘要未使用，会话指向新摘要且未撤销。
- 旧 Refresh 再次使用为 401，会话撤销已提交。新 Refresh 和对应 Access 随后也是 401。
- 格式错误 400。库中不存在的 43 位凭据 401。
- 同一 Refresh 并行两次：一次 200、一次 401。会话已撤销，先返回的新 Refresh 再使用为 401。

未覆盖过期、绝对上限、禁用、软删、数据库 503 和事务冲突重试。

## 关联文档

[阶段 05 第 5 节与第 8 节](../05-authentication/implementation.md)、[ADR 0004](../decisions/0004-security-and-data-policy.md)。
