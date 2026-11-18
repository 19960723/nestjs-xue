# CHG-20261117-002：停用、并发管理员、审计回滚和 Redis 断开测试

- 日期：2026-11-17（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中（本批已验证；阶段 09 的覆盖率与 CI 未完成）

## 背景与原因

第一批隔离库测试没有覆盖停用、软删除、并发管理员保护、审计与业务同事务，以及 Redis 故障。用户授权把这些已有行为收成可重复测试，不改业务代码。

## 涉及模块与文件

- `project/test/auth-security.integration-spec.ts`
- `doc/09-testing/implementation.md`

## 具体变更

同一套件增加 7 项。停用和软删除后，旧 Access 与再次登录都是 401。两名管理员同时清空对方角色时，一个成功、一个冲突，有效管理员仍剩一名。

审计失败由测试库上的 `CHECK (1 = 0)` 触发。加约束前先删除该库里已有的审计行，否则 MySQL 会拒绝这个约束。启用、停用、软删除和角色替换返回 500，改密和退出返回 503；用户状态、版本、会话和角色保持原样。约束在 `finally` 中删除。

Redis 只断开本进程客户端，不关闭本机 Redis。断开时存活为 200，就绪和登录为 503；重新连接后就绪为 200。

## 兼容性影响

没有 API、依赖或业务行为变化。命令仍是 `pnpm run test:integration:auth`。

## 数据库影响

只使用隔离库，不改开发库，不 `reset`，不 `drop`。通过的库是 `init_xue_test_mwkvdcw0`。同一次准备里，失败那轮留下 `init_xue_test_mwkvce54`，没有删除。

## 验证方式与结果

2026-11-17，Windows，Node 24.22.2，工作目录 `project/`。

- 命令：`pnpm run test:integration:auth`
- 结果：退出码 0。`Test Suites: 1 passed`，`Tests: 16 passed`。
- 输出未出现密码、令牌或连接串。

未运行覆盖率、CI 和 `pnpm run test:e2e`。

## 关联文档

- [阶段 09](../09-testing/implementation.md)
- [CHG-20261117-001](2026-11-17-001-auth-integration.md)
