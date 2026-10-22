# 初始化检查中的静态差异

编号：TS-001。日期：2026-10-21。状态：初始静态快照保留；阶段 01 涉及的问题已修复并通过本地验收，Prisma/服务等后续项仍待实施。

## 现象、证据与处理

| 问题 | 静态证据 | 处理与后续验证 |
| --- | --- | --- |
| 日志地址有/api，实际未设前缀 | main日志含/api，但未调用setGlobalPrefix，Controller路径为空 | 01明确设置/api+URI v1，用curl验证health；不只改日志 |
| Hello World测试可能失败 | app.service返回带尾随空格，spec/e2e期望无空格 | 01按预期修正返回或测试，Jest实际运行后记结果；当前不能称已复现失败 |
| Prisma旧笔记示例混用 | 旧档案含prisma-client-js/schema URL/无adapter示例 | 02统一7.10.1、prisma7.config.ts、MySQL adapter与生成路径；generate/build/真库验收 |
| Observe取不到.env凭据 | AppModule求值时读取process.env，ConfigModule.forRoot在后 | 01先加载环境再初始化，默认可关闭；分别测开/关/缺凭据 |
| 两套锁文件不一致 | npm锁仍为旧根依赖，pnpm锁含config/dotenv | 01审阅后统一pnpm，不用删node_modules/强制安装当第一步 |
| Docker socket权限拒绝 | 沙箱内info失败，获准只读查询返回29.6.1 | 是权限边界，不据此断言Docker服务没启动；本次引擎已只读验证 |
| MySQL/Redis CLI未找到 | PATH中无mysql/redis-cli | 不等于服务未安装/未运行；确认容器/远程地址和版本，不自动安装或重置 |

## 复现与结果记录

目前仅版本信息与文件检查结果可复核，记录见 [环境盘点](../00-overview/environment-audit.md)。后续实际修复时，在原阶段/changelog补环境、命令、期望、实际与回归范围；真实Secrets、token、数据库连接串一律脱敏。

## 回滚与预防

本次只新增/整理文档，代码没有变更可回滚。未来修改应局部进行，保留用户未提交改动；Prisma示例统一引用技术栈和02，不再复制多份互不兼容实现；工具迁移使用 [ADR0003](../decisions/0003-tooling-alignment.md)。

## 阶段 01 修复与新增排错证据（2026-10-21）

日志/路由、Hello World 尾空格、Observe 初始化顺序及双锁问题已在阶段 01 修复：前缀与 URI v1 由 main/E2E 共用；配置工厂先校验，再按开关动态加载 Observe；Jest 27 项单元测试及 5 项 HTTP E2E 通过，仅保留 pnpm 锁文件。原表是修复前的静态发现，不能作为当前代码状态。

| 症状 | 原因与处理 | 验证 |
| --- | --- | --- |
| ERR_PNPM_UNEXPECTED_STORE / pnpm exec 提示 NO_TTY 或要求重装 | 沙箱视图的默认 store 与已有 node_modules 使用的用户 pnpm store 不一致；不要因此删除 node_modules 或改全局配置。使用获准的现有缓存访问执行安装/检查 | 干净副本 frozen-lockfile 离线安装与构建退出 0 |
| ERR_PNPM_IGNORED_BUILDS | pnpm 11 拒绝未审批的 @parcel/watcher/unrs-resolver 安装脚本；先检查脚本和平台预编译包，再在 pnpm-workspace.yaml 显式 allowBuilds=false，保持禁止执行 | 重新安装退出 0，Jest 与 start:dev 成功；其他平台仍需验证 |
| tsconfck 要求 TypeScript ^5，与 TS6 冲突 | 来自待替换的 vite-tsconfig-paths。先验证新工具，再移除旧 Vitest/Oxlint 与路径插件，不用 --force 或降级 TS 掩盖 | pnpm peers check 退出 0，无 peer 问题 |
| ESM 测试能运行，但 tsc 找不到 @jest/globals | pnpm 隔离依赖，不能依赖 Jest 的传递依赖作为自己直接 import 的声明；新增同版本 @jest/globals 30.5.2 直接开发依赖 | typecheck:test 与 27 项单测通过 |
| E2E 的 listen EPERM | 沙箱阻止监听回环端口，属于执行权限限制；使用允许本机测试端口的执行环境，不改为 mock HTTP 绕过 | 获准后 5 项 E2E 和 health 运行断言通过 |

回归方式、版本、配置键和运行结果统一见 [阶段 01 第 8 节](../01-initialization/implementation.md#8-验收标准)。不输出真实 Secrets；开发/生产隔离测试使用临时 .env，个人文件保持原样。

## Prisma 依赖安装排错（2026-10-22）

- 症状与证据：用户安装 prisma 7.10.1 后出现 `ERR_PNPM_IGNORED_BUILDS`，pnpm-workspace.yaml 的 prisma/@prisma/engines 值为 `set this to true or false`；继续添加 Client/adapter 时同样拦截 @scarf/scarf 1.4.0。
- 原因与处理：pnpm11 默认拒绝未审批安装脚本。检查实际包声明后，仅对 prisma（Node 版本预检）、@prisma/engines（引擎准备）设 allowBuilds=true；@scarf/scarf 是 swagger-ui-dist 的安装统计依赖，设 false；原 watcher/resolver 的 false 保留。补跑 `pnpm install --frozen-lockfile` 和 `pnpm rebuild @prisma/engines prisma`，不用全局放开或删除 node_modules。
- 环境限制：沙箱元数据请求出现 `ERR_PNPM_META_FETCH_FAIL`，安装出现 `ERR_PNPM_UNEXPECTED_STORE`，依赖树查询出现 SQLite 缓存权限错误；获准后联网并复用原缓存，未改全局 store 配置。
- 结果与验证：详见 [本次安装记录](../changelog/2026-10-22-001-prisma-dependencies.md)。glob 弃用警告与安装脚本审批分别处理，不能仅据下载进度认定安装成功。
- 回滚：仅回退本次 Prisma 直接依赖、对应锁文件与安装脚本策略差异，保留阶段 01 和用户其他修改，再用匹配 pnpm 安装；本次没有数据库变更可回滚。
