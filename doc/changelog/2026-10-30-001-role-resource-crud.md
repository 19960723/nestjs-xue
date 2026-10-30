# CHG-20261030-001：补齐角色资源 CRUD

- 日期：2026-10-30（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：角色资源 CRUD 已实现；类型/构建及目标文件静态检查已通过；数据库/HTTP 行为未验证；完整 RBAC 仍计划中

## 背景与原因

用户确认先补角色模块半成品，不先收拢 DATABASE_URL，不实施认证与权限 Guard。原列表/详情/更新/删除返回 Nest CLI 脚手架字符串，查询 DTO 未接线。

## 涉及模块与文件

- `project/src/modules/roles/roles.service.ts`
- `project/src/modules/roles/roles.controller.ts`
- `project/src/modules/roles/roles.module.ts`
- `project/src/modules/roles/role.select.ts`
- `project/src/modules/roles/dto/role-response.dto.ts`
- 删除 `project/src/modules/roles/dto/role.vo.ts`
- [阶段 06](../06-authorization/implementation.md)、架构、导航、路线图、总览与本变更记录

## 具体变更

列表接入 QueryRoleDto，详情/更新/删除使用 ParseIntPipe；公开字段白名单与创建一致；删除前在事务内检查 user_roles，已分配 409。RolesModule 显式导入 PrismaModule。未改 Schema、迁移、Users、数据库配置或全局响应包装。

## 兼容性影响

`GET/PATCH/DELETE /api/v1/roles` 从占位字符串变为真实查询/写入。分页响应字段为 list，与当前用户列表一致。接口仍匿名可访问，仅限隔离本地。回滚时还原上述角色文件并恢复空 vo 文件即可。

## 数据库影响

无 Schema 或迁移变更。删除依赖现有 `user_roles` 表计数；未应用迁移时运行行为待确认。未执行 migrate/reset。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3；运行目录 `project/`。`tsc --noEmit --incremental false -p tsconfig.build.json`、`pnpm run build`、`eslint src/modules/roles --max-warnings=0`、`prettier --check src/modules/roles`、仓库 `git diff --check` 均退出 0。未运行 Jest、HTTP 或数据库操作。

## 关联文档

[阶段 06](../06-authorization/implementation.md)、[架构](../00-overview/architecture.md)、[测试暂缓约定](../09-testing/implementation.md)。
