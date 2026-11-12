# CHG-20261112-002：权限目录与角色分配

- 日期：2026-11-12（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。权限目录和角色分配已本地 HTTP 验收；阶段 06 整体未完成

## 背景与原因

权限 Guard 已经默认拒绝，但库里没有权限目录，也没有接口把角色授给用户。没有目录时，现有账号调用用户和角色接口都会得到 403。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- `project/prisma/migrations/20261112160000_add_role_is_system/migration.sql`
- `project/scripts/seed-permissions.mjs`
- `project/scripts/grant-admin.mjs`
- `project/src/modules/authorization/`
- `project/src/modules/roles/roles.service.ts`
- `project/src/modules/roles/role.select.ts`
- `project/package.json`
- [阶段 06](../06-authorization/implementation.md)
- [阶段 02](../02-database/implementation.md)

验收脚本只在本次执行，未保留。

## 具体变更

`roles` 增加 `is_system`，默认 false。种子写入 8 个 API 权限，并保证系统角色 `admin` 拥有这 8 个权限、`member` 在创建时没有管理权限。种子不创建用户，也不在启动时执行。

新增接口：

- `GET /permissions`
- `GET /roles/:id/permissions`
- `PUT /roles/:id/permissions`
- `GET /users/:id/roles`
- `PUT /users/:id/roles`

替换是全量操作，失败会回滚。操作者只能授予自己已有的权限，不能修改自己的角色。系统角色不能删除、禁用或修改编码。清空角色时必须还留下至少一名有效管理员。

`node --env-file=.env scripts/grant-admin.mjs <username>` 可以把 admin 授给一个已有且启用的账号。它不设置密码。本次没有执行。

## 兼容性影响

角色响应增加 `isSystem`。原来的用户资料接口仍然不接收角色。库里已有、未分配且没有权限的 `ADMIN` 被标成系统角色，编码没有改。当前没有任何用户持有 admin，所以现有登录调用用户和角色接口仍会 403。

## 数据库影响

迁移 `20261112160000_add_role_is_system` 只新增一列，默认 false。没有 reset，没有改写已应用迁移。应用后库相对 Schema 的 diff 为空。回滚时可删除该列。本次未执行回滚。

种子写入 8 条权限、系统角色 `member`，并把 `admin` 的权限关联设为这 8 条。重复执行后数量不变。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1。工作目录 `project/`。类型检查、改动文件 ESLint 和 Prettier 退出码 0。`pnpm authz:seed` 两次输出均为 `permissions 8 admin-links 8 member-links 0`。

重启服务后验收脚本退出码 0。临时用户和临时角色已删除。输出不含 token、密码或连接串。

- 无令牌查询权限目录为 401；有权限时为 200，目录 8 条。
- 授予自己没有的权限为 403；授予已有权限为 200。
- 修改、删除或禁用系统角色为 409。
- 修改自己的角色为 403。
- 清空角色权限后，原来的 Access 下一请求变为 403，查看自己仍为 200。
- 只剩一名有效管理员时清空他的角色为 409；有第二名后再清空其中一名为 200。

未覆盖停用用户、已删除用户、数据库 503 和并发互删。

## 关联文档

[阶段 06 第 5.1.1 节、第 5.3.5 节与第 8 节](../06-authorization/implementation.md)、[阶段 02](../02-database/implementation.md)。
