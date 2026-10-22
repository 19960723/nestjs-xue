# CHG-20261021-002：阶段 01 初始化实施与本地验收

- 日期：2026-10-21（Asia/Shanghai）
- 变更类型：新增 / 修改 / 修复
- 文档状态：已更新，静态检查通过
- 功能状态：阶段 01 已验证（本地）；阶段 02～10 仍按各自状态推进

## 背景与原因

用户明确要求“先按文档01阶段，进行修改”。在干净工作区上实施 5.1～5.5；沿用既有 Nest12/ESM/TS6，补齐初始化门槛，不开发数据库或业务模块。

## 涉及模块与文件

- 环境/包管理：project/package.json、pnpm-lock.yaml、pnpm-workspace.yaml、.nvmrc；审阅后删除 project/package-lock.json。
- 类型/质量：project/tsconfig.json、tsconfig.test.json、eslint.config.mjs、jest*.config.mjs、scripts/clean-test-dist.mjs、.prettierignore；移除 vitest*.config.ts 与 .oxlintrc.json。
- 配置/启动：project/src/config/env.validation.ts、src/app.module.ts、src/main.ts、src/bootstrap/configure-app.ts、.env.example。
- HTTP/测试：project/src/modules/health/*、src/app.service.ts、src/app.controller.spec.ts、src/app.module.spec.ts、src/config/env.validation.spec.ts、test/app.e2e-spec.ts、test/setup-env.ts。
- Git 与文档：根/project 的 .gitignore、两级 README、AGENTS、doc 导航/总览/路线图/技术栈/环境记录、01/09、ADR0003 与索引、排错与变更索引、manifest。

## 具体变更

固定 Node 24.18.0、pnpm 11.13.1 与 Nest/TS/质量工具基线，仅保留 pnpm 锁文件。npm 锁文件根依赖没有独有条目或范围，却缺少 config/dotenv；审阅后移除。pnpm 构建脚本策略明确禁止 @parcel/watcher/unrs-resolver 脚本，使用平台预编译包；未开放全局脚本权限。

保持 NodeNext/ESM，开启属性初始化检查，生产只带 node 类型，测试通过 tsc 预编译到 .test-dist 再由 Jest VM Modules 执行。新增 Jest/ESLint 及精确辅助依赖，通过新工具后移除 Vitest/Oxlint/旧路径插件与配置；保留 Prettier。

ConfigModule 加载后先校验 PORT/NODE_ENV/HOST/LOG_LEVEL/OBSERVE_ENABLED；production/test 忽略个人 .env，ConfigService 使用规范化值。Observe 默认关闭，关闭时不动态加载 SDK；启用时先检查凭据，再注册同次创建的模块与 instrument。真实凭据与远端服务未调用。

main/E2E 复用 /api + URI v1 配置，新增 GET /api/v1/health/live，响应仅 {status:"ok"}；开启退出钩子，启动日志与真实地址一致。保留问候接口但修正尾空格，路径改为 /api/v1。新增配置和 Observe 接线回归测试。

## 兼容性影响

原 GET / 改为 GET /api/v1；新增健康接口。开发/生产启动脚本指向真实 .js 构建产物。默认无 Observe 外部依赖，开启需 OBSERVE_ENABLED=true 和两项凭据。LOG_LEVEL 采用 Nest 原生枚举；生产必须由进程注入 NODE_ENV=production 与实际监听地址。数据库拆分示例键统一为 DATABASE_URL，目前不校验数据库必填。

旧 test:watch 已移除；需要监听时按阶段 09 分别运行 tsc 与 Jest watch。集成配置只建立入口，尚无数据库/Redis 集成用例。ADR0003 已接受，其余 ADR 不自动转为已接受。已有跟踪 .DS_Store 保留，新增 ignore 不代表解除跟踪。

回滚应整体恢复本次代码/配置/依赖和对应锁文件，之后使用匹配工具安装；不手改全局缓存、不执行数据库回滚。个人 .env 不属于回滚内容。

## 数据库影响

无。未安装 Prisma、连接数据库、执行迁移/SQL、启动容器或部署。

## 验证方式与结果

环境：Darwin arm64，Node 24.18.0、pnpm 11.13.1、Nest 12.1.3、TS 6.0.3、Jest/@jest/globals 30.5.2、ESLint 10.13.0、typescript-eslint 8.72.0。精确辅助包及 engines/peers 见技术栈。

project/ 中 typecheck、typecheck:test、build、lint、format:check、pnpm test（27 项）、test:e2e（5 项）、peers check 全部退出 0；配置/脚本文件另行格式检查通过。隔离临时目录直接运行 dist/main.js，13 项配置失败/环境隔离/health/SIGTERM 断言通过。干净临时副本 frozen-lockfile 离线安装、build、start:dev 与健康检查通过；故意类型错误和 lint 错误均正确阻断。

首次安装忽略脚本、旧工具 peer 冲突与沙箱监听 EPERM 已查明并处理，未使用强制安装或放宽 peer 规则。个人 .env 只比较前后完整性，不输出值或摘要，文件未变。完整命令、断言与执行边界见阶段 01 第 8 节。

未验证：真实 Observe 凭据/采集、Linux/其他 CPU、完整 CI、数据库/Redis 及后续业务。Jest VM Modules 实验性提示属于 ADR0003 已记录的限制。本地验收不代表生产可部署。

文档静态检查：43 个 Markdown 文件、228 个本地链接/锚点、10 份阶段文档章节结构及 manifest 覆盖均通过；git diff --check 与最终格式检查通过。

## 后续维护：补充代码注释（2026-10-22）

按用户要求为现有 18 个 TS/MJS 文件补充中文注释，说明启动顺序、模块组装与配置校验边界、Observe 延迟加载、健康接口职责、测试环境隔离、Jest 预编译方式和测试产物清理范围。仅增加或完善注释，保留目录、依赖、接口、实现与已有未提交变更。

验证：18 个文件在移除注释后的 TypeScript 转译输出与本轮修改前逐文件一致；`tsc --noEmit -p project/tsconfig.test.json`、ESLint 零 warning、相关源码/测试/工具配置的 Prettier 检查及 `git diff --check` 均通过。未重新安装依赖、启动应用或执行整套运行测试；阶段 01 的功能验收仍以 2026-10-21 的记录为准。

## 后续维护：按学习目标梳理阶段 01（2026-10-22）

用户明确以从零理解 NestJS 开发流程为目标。已在原阶段 01 第 3.1～3.3 节补充现有代码阅读顺序，分别讲清启动装配与请求调用、Module/Controller/Service/依赖注入职责、本项目配置工厂的用途、当前应掌握与可暂缓的工具、手动观察步骤及学习自检项。学习自检与历史功能验收分别记录，未将学习者理解程度标为已验证。

本次仅更新原阶段文档与本变更记录，应用、测试、脚本和依赖文件保持本轮开始时的状态；没有删除测试、改变技术选择、放宽安全验收门槛或启动后续阶段。类型/构建/HTTP 命令为学习者后续手动操作，本轮未执行运行验收。文档本地链接/锚点与十章节结构已静态检查，应用及依赖文件前后完整性比较一致。

## 关联文档

[阶段 01](../01-initialization/implementation.md)、[阶段 09](../09-testing/implementation.md)、[技术栈](../00-overview/tech-stack.md)、[环境记录](../00-overview/environment-audit.md)、[ADR0003](../decisions/0003-tooling-alignment.md)、[排错](../troubleshooting/initial-findings.md)。
