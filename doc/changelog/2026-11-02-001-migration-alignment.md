# CHG-20261102-001：核对数据库迁移是否与 Schema 一致

- 日期：2026-11-02（Asia/Shanghai）
- 变更类型：核对
- 文档状态：已更新
- 功能状态：进行中。本地迁移历史与 Schema 一致；阶段 02、04 未标为已验证

## 背景与原因

用户资料接口已经按当前 User 字段写入，需要确认迁移历史、本地库和 Schema 是否还停留在旧的 `name` 列。只生成并审阅增量 SQL，不应用、不 reset。

## 涉及模块与文件

- `project/prisma/schema.prisma`
- `project/prisma/migrations/20261022071222_init_users/migration.sql`
- `project/prisma/migrations/20261022152735_create_role_userrole/migration.sql`
- `project/prisma/migrations/20261031082805_add_role_permission/migration.sql`
- 曾写出并已删除的空目录 `project/prisma/migrations/20261102044516_align_current_schema/`

## 具体变更

没有改 Schema，没有改已有迁移，没有执行 `migrate deploy` 或 `migrate reset`。

`prisma migrate dev --create-only --name align_current_schema` 生成了只含注释 “This is an empty migration.” 的文件。库已经和 Schema 一致，这条空迁移会变成待应用记录，因此已删除。

## 兼容性影响

应用代码和接口契约没有变化。

## 数据库影响

本地 `migrate status` 在删除空迁移后仍是 3 份迁移、数据库已是最新。库到 Schema 的 `migrate diff --script` 输出 “This is an empty migration.”。按迁移目录做 diff 失败，原因是 `prisma.config` 未设置 `shadowDatabaseUrl`，该对比没有执行。

已应用的 `20261031082805_add_role_permission` 审阅结果：

- `permissions`、`role_permissions`、`sys_user_session` 是新建表。
- `password`、`username`、`nickname`、`avatar` 等新列可空，没有写入占位密码。
- `users.name` 是 `DROP COLUMN` 后 `ADD nickname`，不是 `RENAME COLUMN`。`age` 和原来的驼峰 `createdAt`/`updatedAt` 同样是删列再建下划线列。应用当时这些旧列中的值没有迁到新列。该文件已在迁移历史中，不能回改。

未查询表内业务数据，不能判断删除发生时这些列是否已有值。未在其他环境核对。

## 验证方式与结果

2026-11-02，在 `project/` 使用项目自带 Prisma 7 CLI 和 `prisma7.config.ts`。连接串未记录。

- `prisma migrate status`：3 migrations found，Database schema is up to date。删除空迁移后复跑，结果相同。
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`：空迁移注释，退出码 0。
- `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`：因缺少 `shadowDatabaseUrl` 失败，退出码 1。
- `prisma migrate dev --create-only`：写出空 SQL，未应用。随后删除该目录。没有出现 reset 提示。

未执行 Jest、HTTP 或 `migrate deploy`。

## 关联文档

- [阶段 02 第 6 节](../02-database/implementation.md#6-数据库设计)
- [阶段 04](../04-user-management/implementation.md)
- [阶段 05](../05-authentication/implementation.md)
- [阶段 06](../06-authorization/implementation.md)
