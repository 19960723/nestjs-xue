# CHG-20261114-001：用户软删除

- 日期：2026-11-14（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：进行中。单条软删除已本地 HTTP 验收；阶段 04 整体未完成

## 背景与原因

删除用户原来是物理删除，而且已分配角色时直接拒绝。软删除要留下记录，同时让旧登录立即失效，并守住最后一名有效管理员。

## 涉及模块与文件

- `project/src/modules/users/users.service.ts`
- `project/src/modules/users/users.controller.ts`
- [阶段 04](../04-user-management/implementation.md)
- [阶段 02](../02-database/implementation.md)

验收脚本只在本次执行，未保留。

## 具体变更

`DELETE /users/:id` 改为写入 `deletedAt`，把 `tokenVersion` 加一，并撤销该用户全部未撤销会话。响应 `data` 为 null。

重复删除、详情、列表和资料更新都按用户不存在处理。登录也拒绝已删除用户。不能删除自己。删除系统管理员前，必须还留有另一名启用且未删除的管理员。角色关联保留。用户名、邮箱和手机号继续占用唯一索引。

没有恢复接口，也没有批量删除。

## 兼容性影响

已分配角色不再返回 409，删除会成功并留下 `user_roles`。资料更新改成按未删除条件写入，已删除用户返回 404。

## 数据库影响

无 Schema 变更。没有新迁移。验收结束后临时用户和临时角色已物理删除。唯一有效管理员的状态仍为 1，删除时间仍为空。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1。工作目录 `project/`。`tsc --noEmit --incremental false -p tsconfig.build.json`、用户模块 ESLint 和 Prettier 退出码 0。

重启服务后验收脚本退出码 0。输出不含 token 或密码。

- 删除返回 200，`code` 为 `OK`，`data` 为 null。角色关联仍为 1，未撤销会话数为 0。
- 详情 404，列表条数为 0。原 Access 和再次登录都是 401。
- 再次删除 404，修改资料 404，用原用户名和邮箱重建返回 409。
- 删除自己返回 403。删除唯一有效管理员返回 409，该用户状态仍为 1，删除标记为 0。
- 临时数据剩余 0。

未覆盖两名管理员同时互删。

## 关联文档

[阶段 04](../04-user-management/implementation.md)、[阶段 02 第 6 节](../02-database/implementation.md)。
