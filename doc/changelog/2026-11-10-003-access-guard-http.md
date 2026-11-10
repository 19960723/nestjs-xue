# CHG-20261110-003：验收登录与 Access Guard

- 日期：2026-11-10（Asia/Shanghai）
- 变更类型：核对
- 文档状态：已更新
- 功能状态：进行中。登录与 Guard 切片本地 HTTP 已验证；刷新、退出、重置未实现，阶段 05 整体未完成

## 背景与原因

登录、全局 Access Guard 和 `GET /auth/me` 已实现，文档仍写着 HTTP 未验收。用户已手工调用过，但没有留下可复核的命令和结果。本次用临时账号重放关键请求，并把脱敏结果写入阶段 05。

## 涉及模块与文件

- [阶段 05](../05-authentication/implementation.md)
- [路线图](../00-overview/roadmap.md)
- [文档导航](../README.md)

验收脚本只在本次执行，未保留。没有改应用代码。

## 具体变更

Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1。工作目录 `project/`。已有 `pnpm run start` 监听 `http://127.0.0.1:3000`。

创建临时用户 `verify-guard-20261110`，密码使用文档中的测试密码，Argon2id 参数与 `PasswordService` 相同。验收结束后删除该用户及其会话。

`node --env-file=.env scripts/verify-access-guard.mjs` 退出码 0。输出只含状态码、错误码、公开字段名和布尔断言，不含 token、密码或连接串。

- 无 token：健康检查 200；`/auth/me`、`/users`、`/roles` 均为 401「身份无效」。
- 错误密码登录 401「用户名或密码错误」，响应带 `Cache-Control: no-store`。
- 正确密码登录 200，`tokenType=Bearer`，`expiresIn=900`，同样 `no-store`。Access 声明含 `sub`、`sid`、`jti`，不含密码或权限。数据库保存的是 Refresh 原文的 SHA-256，不是原文。
- 有效 Access 访问 `/auth/me` 和 `/users` 为 200，响应没有 `password`。
- 伪造 Bearer 为 401。将会话 `revokedAt` 写上后，原 Access 访问 `/auth/me` 为 401。

## 兼容性影响

无。临时用户已删除。

## 数据库影响

验收期间插入一名临时用户和一条会话，结束后删除。没有迁移，没有改动其他业务数据。

## 验证方式与结果

见上表。未验证过期 token、错误算法、数据库 503、禁用用户和软删用户。刷新、退出和重置没有执行。阶段 05 保持进行中。

## 关联文档

[阶段 05](../05-authentication/implementation.md)、[CHG-20261110-002](2026-11-10-002-access-guard.md)。
