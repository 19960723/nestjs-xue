# ADR 0003：统一pnpm并迁移Jest/ESLint

- 日期：2026-10-21
- 状态：已接受
- 确认记录：2026-10-21，用户明确要求“先按文档01阶段，进行修改”；已按本决策完成最小迁移并通过本地验收
- 关联：[01](../01-initialization/implementation.md)、[09](../09-testing/implementation.md)

## 背景与约束

用户指定Jest、ESLint、Prettier，但现有模板为Vitest4/Oxlint1且有两套锁文件。TS6与ESM限制了直接套用旧ts-jest示例的可靠性。

## 候选方案

| 方案 | 好处 | 成本 |
| --- | --- | --- |
| 保留现有工具 | 无迁移 | 不符合用户明确目标，需要用户另行改变需求 |
| Jest+ts-jest | 转换方便 | 当前未核实TS6兼容，不能强制绕过peers |
| tsc测试预编译+Jest ESM | 同编译器、保留Nest元数据、避免额外transformer | 需清理编译目录、运行前编译、Jest ESM仍实验性 |

## 决定与理由

采用pnpm11.13.1单锁；Jest30.5.2执行tsc输出的JS测试；ESLint10.13.0+typescript-eslint8.72.0 flat config，Prettier延续3.9.10。工具迁移最低闭环提前到01，09完成分层/CI。types从vitest/globals迁到专用test配置里的jest，生产只node。

## 影响与迁移

先新增配置/最小Jest测试并通过，再移除Vitest/Oxlint及其配置，最后统一pnpm锁。保留当前用户改动，不能直接删npm锁而忽略独有差异。ESLint辅助包补丁在实施时查询精确锁定；不自动引入额外框架。

## 验证与重新评估

版本矩阵与实际迁移均已本地验证：27 项单元测试、5 项 HTTP E2E、类型/构建/lint/格式、干净副本 frozen-lockfile 离线安装及开发启动通过。ESM 测试显式直接依赖 @jest/globals 30.5.2，辅助版本见技术栈；pnpm-workspace.yaml 明确禁止 @parcel/watcher/unrs-resolver 安装脚本并使用平台预编译包。真实 CI 与非 Darwin arm64 平台仍待验证。若预编译方案运行成本不能接受，在获得新的TS6/transformer兼容证据后另记ADR；不得悄悄切回Vitest并称目标完成。

## 依据

[typescript-eslint矩阵](https://typescript-eslint.io/users/dependency-versions/)、[Jest ESM限制](https://jestjs.io/docs/ecmascript-modules)、[环境记录](../00-overview/environment-audit.md)。
