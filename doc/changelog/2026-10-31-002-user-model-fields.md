# CHG-20261031-002：调整 User 模型字段

- 日期：2026-10-31（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：Schema 与资料字段改名已实现；增量迁移未创建；数据库与 HTTP 未验证

## 背景与原因

用户授权只整理 User 表模型：增加用户名、密码、头像、最后登录时间和删除时间，并把 `name` 改为 `nickname`。不改用户模块。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- [阶段 02](../02-database/implementation.md)、[阶段 04](../04-user-management/implementation.md)、总览与导航

曾改过用户模块的 `name` 字段，同日按用户要求改回，用户模块保持原样。

## 具体变更

Schema 中 `name` 改为必填 `nickname`（VarChar 50）。新增可空且唯一的 `username`（VarChar 50）、可空 `password`（VarChar 255）、可空 `avatar`（VarChar 255）、可空 `lastLoginAt` 与 `deletedAt`。列名保持现有 `users` 表的驼峰写法。`password` 只准备存哈希。未改用户模块，也未改写已有迁移文件。

## 兼容性影响

用户接口仍使用 `name`。Schema 改为 `nickname` 后，现有用户代码与生成客户端不一致。

## 数据库影响

没有创建或应用迁移。已有迁移仍使用 `name`。若库中已应用旧迁移，当前 Schema 与库不一致。后续需要审阅增量 SQL，并把存量 `name` 改为 `nickname`；未确认前不 reset、不 drop。

## 验证方式与结果

2026-10-31，Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1、TypeScript 6.0.3；运行目录 `project/`。使用占位 `DATABASE_URL`：

- `prisma validate --config prisma7.config.ts` 退出 0
- `prisma generate --config prisma7.config.ts` 退出 0，生成 Prisma Client 7.10.1

上述检查发生在用户模块仍被改成 `nickname` 时。该改动已撤回，当前用户代码与 Schema 不一致，不能把当时的 `tsc` 当作当前代码通过。未执行 Jest、HTTP、migrate 或真实数据库连接，未读取个人连接串。

## 关联文档

[阶段 02](../02-database/implementation.md)、[阶段 04](../04-user-management/implementation.md)、[ADR 0004](../decisions/0004-security-and-data-policy.md)。
