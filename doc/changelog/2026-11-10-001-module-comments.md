# CHG-20261110-001：业务模块中文注释

- 日期：2026-11-10（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：进行中。只补充注释和文档口径，认证、用户、角色与公共管线的行为未改

## 背景与原因

阶段 01 曾为启动和配置代码补充中文职责注释。之后的用户、角色、认证和请求管线几乎只剩 Swagger 文案，读代码时看不出失败文案、事务边界和 Guard 是否生效。企业级模块需要把这些不变量写在代码旁边。

## 涉及模块与文件

- `project/src/modules/auth/`
- `project/src/modules/users/`
- `project/src/modules/roles/`
- `project/src/common/`
- `project/src/database/prisma/prisma.module.ts`
- `project/src/database/prisma/prisma.service.ts`
- [架构](../00-overview/architecture.md)增加代码注释约定
- [阶段 05](../05-authentication/implementation.md)按源码更正 Guard 与 `GET /auth/me` 的完成口径

## 具体变更

为公开类、会改变安全或一致性的方法，以及表达不了字段规则的 DTO 补充中文注释。注释说明统一 401、dummy 哈希、事务外哈希、签名失败撤销、唯一索引冲突和数据库故障不能放行。不改路由、校验、查询、事务和响应。

对照源码确认：`JwtAuthGuard`、`@Public()`、`CurrentUser` 已有文件，`AuthModule` 没有注册 `APP_GUARD`，没有 `GET /auth/me`。注释和阶段 05 当前契约按这个事实书写，没有顺手把 Guard 接上。

## 兼容性影响

无 API、配置或依赖变化。注释本身不改变运行结果。阶段 05 文档不再把未接线的 Guard 和 `GET /auth/me` 写成已生效。

## 数据库影响

无。

## 验证方式与结果

2026-11-10，工作目录 `project/`。`prettier --write` 覆盖认证、用户、角色、common 和 Prisma 模块源码，相关文件均为 unchanged。`tsc --noEmit -p tsconfig.build.json` 与针对这些目录的 `eslint --max-warnings=0` 退出码均为 0。未启动应用，未跑 Jest 或 HTTP。功能状态不因注释标为已验证。

## 关联文档

[架构](../00-overview/architecture.md)、[阶段 03](../03-api-standards/implementation.md)、[阶段 04](../04-user-management/implementation.md)、[阶段 05](../05-authentication/implementation.md)、[阶段 06](../06-authorization/implementation.md)。
