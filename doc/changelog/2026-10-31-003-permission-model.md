# CHG-20261031-003：增加 Permission 模型

- 日期：2026-10-31（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：Schema 已实现；增量迁移未创建；授权行为未实现、未验证

## 背景与原因

用户授权增加权限表，用于树形权限目录。当前只有 Role 与 UserRole，没有权限实体。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- [阶段 06](../06-authorization/implementation.md)、[阶段 02](../02-database/implementation.md)、总览、路线图与导航

## 具体变更

新增 `Permission`，映射表 `permissions`。字段为 Int 自增 `id`、可空 `parentId`（列 `parent_id`）、`name`、唯一 `code`、`type`、可空 `resource`、可空 `description`、默认 1 的 `status`，以及 `createdAt`/`updatedAt`（列 `created_at`/`updated_at`）。`type` 与 `status` 使用 TinyInt。`parentId` 自关联，删除仍有子节点的权限时 Restrict。`parentId` 另有索引。未建 RolePermission，未改 Role/UserRole，未写接口或 Guard。

主键使用 Int，与 User、Role 一致，没有采用 BIGINT。`type` 的业务取值尚未定义。

## 兼容性影响

没有新增 HTTP 接口。生成客户端增加 Permission 模型。已有用户和角色接口不变。

## 数据库影响

没有创建或应用迁移。Schema 与已有迁移文件、以及可能已应用旧迁移的数据库不一致。未确认前不 reset、不 drop。

## 验证方式与结果

2026-10-31，Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1、TypeScript 6.0.3；运行目录 `project/`。使用占位 `DATABASE_URL`：

- `prisma validate --config prisma7.config.ts` 退出 0
- `prisma generate --config prisma7.config.ts` 退出 0，生成 Prisma Client 7.10.1
- `tsc --noEmit --incremental false -p tsconfig.build.json` 退出 0

未执行 Jest、HTTP、migrate 或真实数据库连接，未读取个人连接串。

## 关联文档

[阶段 06](../06-authorization/implementation.md)、[ADR 0004](../decisions/0004-security-and-data-policy.md)。
