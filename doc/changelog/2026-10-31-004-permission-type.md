# CHG-20261031-004：确定 Permission.type 取值

- 日期：2026-10-31（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：Schema 已实现；增量迁移未创建；未验证数据库

## 背景与原因

用户确定权限类型为目录、菜单、按钮和纯 API，标识分别是 M、C、A、API。原先 `type` 是未定义取值的 TinyInt，存不下这些标识。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- [阶段 06](../06-authorization/implementation.md)

## 具体变更

新增枚举 `PermissionType`：`M` 目录、`C` 菜单、`A` 按钮、`API` 纯 API。`Permission.type` 改为该枚举，必填，无默认值。`status` 仍是 TinyInt。

## 兼容性影响

没有 HTTP 接口变化。生成客户端里 `Permission.type` 从数字改为枚举。

## 数据库影响

没有创建或应用迁移。已有迁移仍不含 `permissions`。

## 验证方式与结果

2026-10-31，Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1、TypeScript 6.0.3；运行目录 `project/`。使用占位 `DATABASE_URL`：`prisma validate`、`prisma generate --config prisma7.config.ts`、`tsc --noEmit --incremental false -p tsconfig.build.json` 均退出 0。未执行 Jest、migrate 或真实连接。

## 关联文档

[阶段 06](../06-authorization/implementation.md)、[CHG-20261031-003](2026-10-31-003-permission-model.md)。
