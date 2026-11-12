# CHG-20261112-001：权限 Guard

- 日期：2026-11-12（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。权限 Guard 已本地 HTTP 验收；阶段 06 整体未完成

## 背景与原因

登录成功后就能调用用户和角色接口。阶段 06 约定这些接口默认拒绝，并在撤掉关联后的下一次请求生效。密码重置仍没有可信交付渠道，这一批不做。

## 涉及模块与文件

- `project/src/common/decorators/authenticated.decorator.ts`
- `project/src/common/decorators/require-permissions.decorator.ts`
- `project/src/modules/authorization/api.guard.ts`
- `project/src/modules/authorization/permissions.guard.ts`
- `project/src/modules/authorization/authorization.module.ts`
- `project/src/app.module.ts`
- `project/src/modules/auth/auth.module.ts`
- `project/src/modules/auth/auth.controller.ts`
- `project/src/modules/users/users.controller.ts`
- `project/src/modules/roles/roles.controller.ts`
- [阶段 06](../06-authorization/implementation.md)

验收脚本只在本次执行，未保留。

## 具体变更

全局只保留一个 `ApiGuard`。它先校验 Access，再按路由声明查库。`Public` 放行健康检查、登录和刷新。`Authenticated` 只要求已登录，用于当前用户、退出和修改密码。用户和角色接口分别要求 `users:create/read/update/delete` 与 `roles:read/write`，多项必须同时具备。

没有令牌返回 401。已登录但缺少声明或权限返回 403「权限不足」。数据库故障返回 503。每次请求直接查询启用的权限和角色，不使用 JWT 角色快照，也不缓存。

## 兼容性影响

没有新迁移，也没有新依赖。原来仅凭登录就能调用的用户和角色接口，现在没有对应权限会返回 403。查看自己、退出和修改密码保持只要登录即可。没有写入默认管理员或权限目录。

## 数据库影响

无 Schema 变更。验收时插入的 `users:read`、临时角色和两个用户已删除。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1。工作目录 `project/`。`tsc --noEmit -p tsconfig.build.json` 以及改动文件的 ESLint、Prettier 退出码 0。重启 `pnpm run start` 后执行验收脚本，退出码 0。输出不含 token、密码或连接串。

- 无令牌访问用户列表为 401；健康检查为 200。
- 具备 `users:read` 时用户列表为 200，角色列表为 403。
- 无角色的登录访问用户列表为 403，当前用户和退出为 200。
- 删除角色关联后，原来的 Access 再访问用户列表为 403，当前用户仍为 200。

未覆盖数据库 503、停用角色或权限，以及装饰器冲突。

## 关联文档

[阶段 06 第 5.2.1 节与第 8 节](../06-authorization/implementation.md)、[ADR 0004](../decisions/0004-security-and-data-policy.md)。
