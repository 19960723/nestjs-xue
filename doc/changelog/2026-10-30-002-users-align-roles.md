# CHG-20261030-002：用户模块对齐角色资源写法

- 日期：2026-10-30（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：用户 CRUD 已对齐公开字段白名单与删除前关联检查；类型/构建静态检查通过；数据库/HTTP 未验证；软删与目标身份模型仍未实施

## 背景与原因

角色资源 CRUD 落地后，Users 仍使用 `data: dto`、`+id`、查询无 `select`、硬删会触发 UserRole Cascade。用户要求按 Roles 对齐，不改表、不上认证。

## 涉及模块与文件

- `project/src/modules/users/user.select.ts`（新建）
- `project/src/modules/users/users.service.ts`
- `project/src/modules/users/users.controller.ts`
- [阶段 04](../04-user-management/implementation.md)、架构、总览与本变更记录

## 具体变更

查询统一 `userPublicSelect`（当前标量字段，不含 roles）。创建/更新只写 name/email/age。路径 ID 使用 ParseIntPipe。删除在事务内确认存在且无 `user_roles` 后物理删除，已分配 409。未导入 PrismaModule、未取消 `@Global()`。

## 兼容性影响

非法路径 ID 从可能的 NaN 查询变为 400。已分配角色的用户删除从 Cascade 清关联变为 409。公开响应字段与原先标量输出一致。接口仍匿名，仅限隔离本地。

## 数据库影响

无 Schema 或迁移变更。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3；运行目录 `project/`。`tsc --noEmit --incremental false -p tsconfig.build.json`、`pnpm run build`、`eslint src/modules/users --max-warnings=0`、`prettier --check src/modules/users`、仓库 `git diff --check` 均退出 0。未运行 Jest、HTTP 或数据库操作。

## 关联文档

[阶段 04](../04-user-management/implementation.md)、[阶段 06](../06-authorization/implementation.md)、[架构](../00-overview/architecture.md)。
