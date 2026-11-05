# CHG-20261031-005：增加角色权限关联

- 日期：2026-10-31（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：Schema 已实现；增量迁移未创建；授权行为未实现、未验证

## 背景与原因

用户授权补充角色与权限的关联表，使用户、角色、权限在模型上连成一套。此前只有 UserRole 和独立的 Permission。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- [阶段 06](../06-authorization/implementation.md)、[阶段 02](../02-database/implementation.md)、总览、路线图与导航

## 具体变更

新增 `RolePermission`，映射 `role_permissions`。自增 `id`，`roleId`/`permissionId` 映射 `role_id`/`permission_id`，二者联合唯一。删除角色或权限时级联删除关联行。另有 `permissionId` 索引。Role 增加 `permissions`，Permission 增加 `roles`。未改 UserRole 的级联行为，未写授权接口或 Guard。

## 兼容性影响

没有 HTTP 接口变化。生成客户端增加 RolePermission，以及 Role、Permission 上的关联字段。

## 数据库影响

没有创建或应用迁移。已有迁移不含 `permissions` 和 `role_permissions`。

## 验证方式与结果

2026-10-31，Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1、TypeScript 6.0.3；运行目录 `project/`。使用占位 `DATABASE_URL`：`prisma validate`、`prisma generate --config prisma7.config.ts`、`tsc --noEmit --incremental false -p tsconfig.build.json` 均退出 0。未执行 Jest、migrate 或真实连接。

## 关联文档

[阶段 06](../06-authorization/implementation.md)。
