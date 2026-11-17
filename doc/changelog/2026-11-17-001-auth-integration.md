# CHG-20261117-001：认证与授权安全场景隔离库测试

- 日期：2026-11-17（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中（本批 9 项已验证；阶段 09 的覆盖率与 CI 未完成）

## 背景与原因

认证和授权此前只有手工 HTTP 记录，验收脚本没有留在仓库里。用户授权把这批已有行为收成可重复的真实数据库测试，不改业务代码。

## 涉及模块与文件

- `project/test/setup-integration-env.ts`
- `project/test/auth-security.integration-spec.ts`
- `project/scripts/run-auth-integration.mjs`
- `project/jest.integration.config.mjs`
- `project/package.json`
- `doc/09-testing/implementation.md`

## 具体变更

准备脚本只创建库名匹配 `init_xue_test_<runid>` 的本机库，对它执行已有迁移的 `migrate deploy` 和权限种子。测试进程在导入应用前校验这个库名，并改用测试专用 JWT 密钥。断言只看状态码、`code` 和 `requestId`。用例结束删除本次夹具用户；审计行先于用户删除。

Jest 集成配置的扫描根改为 `.test-dist/test`。在 Windows 上从项目根扫描时，这个点开头的目录不会被计入。

## 兼容性影响

没有 API、依赖或业务行为变化。新增命令 `pnpm run test:integration:auth`。`pnpm run test:integration` 现在会要求 `TEST_DATABASE_URL`，不能再落到开发库名。

## 数据库影响

只新增隔离库，不改开发库，不 `reset`，不 `drop`。本次通过的库是 `init_xue_test_mwkt4i9d`。准备过程中还留下三份未跑用例的库：`init_xue_test_mwksx7m2`、`init_xue_test_mwksy3wi`、`init_xue_test_mwksyly1`。它们只含已有迁移和可能的权限种子，没有删除。

## 验证方式与结果

2026-11-17，Windows，Node 24.22.2，工作目录 `project/`。

- 命令：`pnpm run test:integration:auth`
- 结果：退出码 0。`Test Suites: 1 passed`，`Tests: 9 passed`。
- 覆盖：登录失败同一 401、无令牌 401、无权限 403、撤权后立即 403、Refresh 轮换与重放、当前退出、全部退出、改密后旧凭据失效、最后一名管理员不能删除或清空角色。
- 输出未出现密码、令牌或连接串。

未运行覆盖率、CI 和 `pnpm run test:e2e`。后者在 Windows 上仍从项目根扫描 `.test-dist`，当前找不到用例。

## 关联文档

- [阶段 09](../09-testing/implementation.md)
- [路线图](../00-overview/roadmap.md)
