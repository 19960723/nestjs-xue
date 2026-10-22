# 阶段 01：环境准备与项目初始化

更新：2026-10-22。文档状态：已更新并完成静态检查。功能状态：已验证（阶段 01 本地验收；不代表后续业务或 CI 已完成）。前置：[环境记录](../00-overview/environment-audit.md)。命令默认在 `project/` 执行。下文保留实施说明；实际执行范围和结果见第 8 节。

实施记录（2026-10-21）：用户已明确授权按阶段 01 修改代码、安装本阶段依赖并执行验收。本次覆盖 5.1～5.5，保持 ESM/NodeNext，先验证 Jest/ESLint 再移除旧工具；数据库、Redis、容器与部署不在本次范围。开始时 Git 工作区干净。Observe 默认关闭；`createAppModule()` 先加载并校验环境，启用时再动态加载 SDK、注册模块与 instrument。验收已完成，证据见第 8 节。

维护记录（2026-10-22）：按用户要求，为启动、配置校验、健康接口、测试配置及清理脚本补充中文职责与原因注释。仅解释现有实现，不调整目录、依赖、接口或执行逻辑；保留全部已有未提交变更。检查结果补充在原 CHG-20261021-002 中。

## 1. 阶段目标

沿用已有 NestJS12/ESM 项目，形成可重复的版本、配置、严格类型、质量工具和启动流程。完成不依赖数据库的存活检查；不在本阶段开发用户等业务。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| 版本与包管理 | 可复现安装 | P0 | Node/pnpm | 单一锁文件、固定 Node/packageManager |
| 严格 ESM | 尽早发现类型/导入错误 | P0 | 现有 TS6 | strict 全开、NodeNext build 成功 |
| 配置校验 | 错配置启动即失败 | P0 | ConfigModule | 非法端口/缺失启用项导致非零退出 |
| ESLint/Jest/Prettier | 开发第一天具备质量门槛 | P0 | 版本矩阵 | 最小测试、lint、format 检查通过 |
| Git 与忽略规则 | 防泄漏/误提交 | P0 | Git | .env 不被跟踪、生成产物被忽略 |
| 启动与 health | 确认进程可服务 | P0 | 上述配置 | `/api/v1/health/live` 返回 200 |

## 3. 技术原理

Nest Module 声明依赖，Provider 经构造函数注入，入口完成 HTTP 配置和启动。TypeScript 的 strict 提供编译期约束，但环境变量与请求仍需运行时校验。

当前 `type: module` 与 NodeNext 已正确对应原生 ESM；相对导入写 `.js`，由 tsc 将对应 `.ts` 编译成 JS。不要把 Prisma 快速入门的 bundler 配置照搬到直接由 Node 运行的项目。生命周期退出需要 `enableShutdownHooks()`，后续数据库/Redis 才能处理 SIGTERM。

ConfigModule 的 validate 在加载时运行；顶层代码读取环境可能发生在它之前。实施前 Observe 顶层读取凭据，存在加载顺序问题；当前已通过配置工厂和可选开关解决。安装/配置路径依据 [Nest 配置](https://docs.nestjs.com/techniques/configuration) 和本地代码，不因 `.env` 存在就认为启动校验已完成。

### 3.1 当前学习主线（2026-10-22）

本项目的学习目标是从零理解 NestJS 开发流程。阶段 01 已有代码通过本地验收，不代表学习者已掌握所有配置。当前先理解一条请求和一次启动，再按需学习工程工具；本节只调整阅读与讲解顺序，不更换技术栈、不删除测试、不改写既有验收记录或后续阶段门槛。

**先区分启动和请求。** 启动时，main 调用配置工厂，Nest 装配模块及依赖，再注册 HTTP 规则并监听端口。请求到来后，已注册的 Controller 方法处理请求，可以调用已注入的 Service；每次请求不会重新运行 main 或配置工厂。Module 负责组织依赖，不是请求逐层经过的业务处理器。

| 顺序 | 阅读文件 | 先理解的内容 | 自己能回答的问题 |
| --- | --- | --- | --- |
| 1：看一个具体结果 | [app.service.ts](../../project/src/app.service.ts)、[app.controller.ts](../../project/src/app.controller.ts) | Service 返回问候内容；Controller 的 @Get() 将请求交给 getHello() | GET /api/v1 为什么得到 Hello World!？改变返回内容应该找哪个方法？ |
| 2：理解依赖注入 | [app.controller.ts](../../project/src/app.controller.ts)、[app.module.ts](../../project/src/app.module.ts) 的 @Module 部分 | AppService 在 providers 中注册，Nest 创建并注入 Controller 的构造函数；@Injectable() 标记可由 Nest 管理的提供者，注册位置也要正确 | 为什么 Controller 不需要自己 new AppService()？controllers 与 providers 各放什么？ |
| 3：理解模块组织 | [app.module.ts](../../project/src/app.module.ts)、[health.module.ts](../../project/src/modules/health/health.module.ts)、[health.controller.ts](../../project/src/modules/health/health.controller.ts) | imports 引入其他模块，controllers 注册路由处理者，providers 注册服务等依赖 | HealthModule 为什么放在 imports？健康接口直接返回固定结果，为什么不必再增加 Service？ |
| 4：理解应用启动 | [main.ts](../../project/src/main.ts)、[configure-app.ts](../../project/src/bootstrap/configure-app.ts) | createAppModule() 先组装配置；NestFactory.create() 创建应用；configureApp() 设置前缀与版本；listen() 开始监听 | 哪一步之后 HTTP 才可访问？/api/v1 从哪里来？ |
| 5：理解运行配置 | [env.validation.ts](../../project/src/config/env.validation.ts)、[app.module.ts](../../project/src/app.module.ts) 的 createAppModule() | 加载环境 → 校验和转换 → 提供给 ConfigService → 启动时读取 | 为什么 PORT 从字符串转为数字？为什么非法配置要在监听前失败？ |

用现有问候接口串起第一条调用链：客户端 GET /api/v1 → AppController.getHello() → AppService.getHello() → 返回字符串。健康接口是另一条更短的链：客户端 GET /api/v1/health/live → HealthController.live() → 返回 {status:"ok"}。Service 用于承载需要独立组织的逻辑，当前不要求每个 Controller 都配一个 Service。

createAppModule() 和 configureApp() 是本项目定义的普通函数。前者解决配置校验与可选 Observe 的加载顺序，后者让 main 与 E2E 共用 HTTP 设置；它们的名称与这套拆分方式不属于每个 Nest 项目都必须照搬的模板。先理解输入、输出与调用时机，再研究内部实现。

### 3.2 当前需要掌握与可以暂缓的内容

| 当前程度 | 内容 | 学习范围 |
| --- | --- | --- |
| 现在理解 | Module、Controller、Service、构造函数注入、main 启动流程 | 能沿代码说明一次启动和一次请求，区分模块注册与方法调用 |
| 现在会使用 | 开发启动、typecheck、build、HTTP 手动验证、基础 lint/格式命令 | 知道命令用途，能发现编译错误和响应不符合预期；不必先掌握工具全部规则 |
| 当前先知道作用 | .env 加载、PORT/HOST 校验、全局前缀、URI 版本 | 能找到实际配置位置，了解错误配置为何阻止启动 |
| 暂缓深入 | Observe SDK、instrument、动态导入与 DynamicModule 的类型细节 | 保持默认关闭，了解其为可选能力；不要求申请真实凭据 |
| 暂缓深入 | Jest mock、E2E 的测试环境、.test-dist 预编译、覆盖率、CI | 已有测试保留作为参考，不继续提前扩展配置；先看对应功能，再学习如何自动验证 |
| 随功能学习 | 数据库集成测试、认证/授权测试、缓存一致性测试 | 在对应阶段理解实际行为后补充；第 09 阶段完善测试分层与 CI，安全验收仍遵循原门槛 |

**每次只推进一个知识点：解释职责 → 阅读一小段现有代码 → 观察实际结果 → 总结调用关系 → 再看对应测试。** 在未理解当前启动与请求主线前，学习重点停留在阶段 01，不因功能状态已验证就立即增加数据库或其他模块。

### 3.3 手动观察与学习完成标准

以下供学习者在 project/ 中操作，本次文档梳理未启动应用或执行这些命令。已有依赖无需重新安装，不覆盖个人 .env；有效配置采用本地回环地址，Observe 保持关闭，端口冲突时使用另一个合法端口。

```bash
NODE_ENV=development HOST=127.0.0.1 PORT=3000 OBSERVE_ENABLED=false pnpm run start:dev
```

看到启动成功后，在另一个终端观察两个现有接口：

```bash
curl -i http://127.0.0.1:3000/api/v1
curl -i http://127.0.0.1:3000/api/v1/health/live
```

按当前实现，分别预期 200 + Hello World! 和 200 + {"status":"ok"}。再运行 `pnpm run typecheck`、`pnpm run build`，区分“类型检查”“生成可执行产物”和“实际启动”。本项目保留 ESM/NodeNext，相对 import 的 .js 指向构建后的 JS 文件，入门时先遵循现有写法。

个人学习检查项，不改变阶段 01 的历史功能状态：

- [ ] 能说明 main、AppModule、Controller、Service 各负责什么。
- [ ] 能从 GET /api/v1 找到对应方法、注入来源和最终返回值。
- [ ] 能指出 /api/v1 的前缀与版本设置位置。
- [ ] 能解释配置工厂为何先于 NestFactory.create() 完成环境校验。
- [ ] 能通过启动日志、HTTP 响应和构建结果定位基础问题。

这些检查项由学习者实际理解后确认，不因文档更新自动勾选。当前不要求独立编写 Jest mock、解释全部工具配置或完成第 09 阶段。

## 4. 实现前准备

使用 [版本表](../00-overview/tech-stack.md)：Node24.18.0、pnpm11.13.1、Nest12.1.3、TS6.0.3。已有 CLI12.0.8；不全局安装。

后续手动安装工具前先查辅助包：

```bash
node -v
pnpm -v
pnpm list --depth 0
pnpm view @eslint/js version engines peerDependencies --json
pnpm view globals version engines --json
pnpm view eslint-config-prettier version peerDependencies --json
pnpm view @types/jest version --json
pnpm view @jest/globals@30.5.2 version engines --json
```

已核实的主体工具可精确安装：

```bash
pnpm add -DE eslint@10.13.0 typescript-eslint@8.72.0 jest@30.5.2 @jest/globals@30.5.2
```

本次辅助包已锁定为 @eslint/js 10.0.1、globals 17.13.0、eslint-config-prettier 10.1.8、@types/jest 30.0.0，依据见技术栈。以后升级仍需查询兼容的正式精确版本，再更新技术栈表。不要不经核实直接复制占位版本。Jest 的具体配置与脚本在 [09 的 5.1](../09-testing/implementation.md#51-迁移测试运行器与编译配置)，本阶段就要完成最小迁移，不等第 09 阶段。

## 5. 详细实施步骤

### 5.1 固定环境并接管已有项目

- 目标：保留已有代码与本地改动，避免重复初始化。
- 文件：修改 `project/package.json`，新建 `project/.nvmrc`；审阅 `project/pnpm-lock.yaml` 和 `project/package-lock.json`。
- 操作：在 .nvmrc 写 `24.18.0`；package 加 `packageManager: "pnpm@11.13.1"`、engines node `>=24.18.0 <25`。统一 Nest 核心到表中同一补丁。确认 npm 锁文件没有需要保留的独有变更，再在本阶段实施时移除它，只保留 pnpm 锁文件并记录。不要删除当前用户改动。本次开始时工作区干净；npm 锁文件根依赖没有独有条目或独有范围，反而缺少 config/dotenv，因此经审阅已移除。pnpm-workspace.yaml 对 @parcel/watcher、unrs-resolver 的安装脚本显式设置 allowBuilds=false，使用平台预编译包，不放开全局脚本权限；Darwin arm64 的构建、Jest 和开发监听已验证，其他平台待 CI 验证。
- 命令：仓库根 `git status --short`；项目目录 `pnpm exec nest --version`。已有项目不运行 `nest new`。仅全新空目录场景用固定 CLI 创建，并先检查新模板是否又带回 Vitest/Oxlint。
- 预期/验证：`pnpm list --depth 0` 与锁文件、版本表一致；在干净 CI 用 `pnpm install --frozen-lockfile` 成功。本次已在不含 node_modules/个人 .env 的临时副本执行 `pnpm install --frozen-lockfile --offline` 与 build；CI 环境仍待阶段 09 验证。

### 5.2 完成 TypeScript、目录和 Git 约定

- 目标：全 strict、生成物不污染仓库。
- 文件：修改 `project/tsconfig.json`、`project/tsconfig.build.json`、`project/.gitignore`；新建根 `.gitignore` 与 `project/.prettierignore`。
- 操作：保留 `module/moduleResolution: "nodenext"`、`target: "ES2023"`、两个装饰器选项；将 `strictPropertyInitialization` 改为 true，基础 types 改为 `["node"]`，测试 types 只放 tsconfig.test；继续排除 spec 的生产构建。DTO 属性后续以 `field!: string` 表示框架赋值，不用关闭整个检查。
- 忽略规则：所有层级 `.DS_Store`、`.env`/`.env.*`（保留 `.env.example`）、node_modules、dist、coverage、.test-dist、*.tsbuildinfo、`src/generated/prisma/`、临时上传文件。Prettier 排除 generated/dist/coverage/锁文件。已跟踪 .DS_Store 不会因 ignore 自动消失，如要解除跟踪必须单独审阅并记录，不能笼统 git rm 所有文件。
- 命令：`pnpm exec tsc --noEmit -p tsconfig.build.json`；仓库根 `git check-ignore project/.env project/src/generated/prisma/client.ts` 和 `git ls-files 'project/.env*'`。
- 预期/验证：真实 .env 不在跟踪列表；.env.example 可跟踪；类型错误逐个修正，不加 any 或放宽 strict 规避。

### 5.3 校验环境并隔离开发/生产配置

- 目标：非法配置不进入运行态。
- 文件：新建 `project/src/config/env.validation.ts`；修改 `project/src/app.module.ts`、`project/src/main.ts`、`project/.env.example`。
- 操作：通过 ConfigModule 的 `validate` 接收原始环境，返回规范化对象；本阶段校验 NODE_ENV、HOST、PORT、LOG_LEVEL、OBSERVE_ENABLED。HOST默认127.0.0.1，只接受明确支持的监听地址（本方案127.0.0.1或0.0.0.0）；生产容器显式设置0.0.0.0。端口用全字符串数字规则 + 整数范围 1～65535，不用能接受 `3000junk` 的 parseInt。后续启用数据库/认证/Redis时再加必填项，禁止用假密钥默认值。

```ts
export function validateEnv(env: Record<string, unknown>) {
  const portText = String(env.PORT ?? '3000');
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1..65535 的整数');
  }
  const nodeEnv = String(env.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV 非法');
  }
  const host = String(env.HOST ?? '127.0.0.1');
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('HOST 非法');
  return { ...env, NODE_ENV: nodeEnv, HOST: host, PORT: port };
}
```

- 解释：这是最小端口/环境片段，需补 LOG_LEVEL 枚举和布尔字面量校验，再 `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`。严格拒绝非 true/false 的开关。生产从运行环境注入，不加载开发 .env。当前 production/test 均设置 ignoreEnvFile，NODE_ENV 由启动环境传入；skipProcessEnv=true 确保 ConfigService 使用已校验的数字/布尔值。LOG_LEVEL 使用 fatal/error/warn/log/debug/verbose 枚举，并实际控制 Nest 日志级别。
- Observe：默认关闭，关闭时不注册 ObserveModule、不传 instrument、不需要 appKey/appSecret。开启时先加载配置并校验凭据，再导入/初始化应用模块。当前实现将 AppModule 保持为无环境读取副作用的静态类；main 与 E2E 均调用异步 createAppModule()。工厂等待 ConfigModule.forRoot({ validate }) 完成，再按已校验开关动态 import SDK，并将同一次 createObserveModule() 返回的模块与 instrument 分别传给根模块和 NestFactory。具体接线已核对安装包 0.3.12 的类型与实现。
- 命令：保留个人 .env，不覆盖；仅缺失时手动从 example 复制。`PORT=invalid pnpm run start` 应非零退出；有效端口运行 `pnpm start:dev`。不输出完整 ConfigService/连接串。
- 预期/验证：无 Observe 凭据但开关 false 可启动；开关 true 且无凭据启动失败；production 不依赖工作目录 .env。

### 5.4 建立质量工具最小闭环

- 目标：对齐目标 Jest/ESLint，而不在两个工具链间长期漂移。
- 文件：新建 `project/eslint.config.mjs`；按 09 创建测试编译配置与 Jest 配置，修改 package scripts、已有两个示例测试，之后移除被替代的 Vitest/Oxlint 配置与依赖。
- 操作：flat config 使用 `@eslint/js` recommended、typescript-eslint recommended 和 eslint-config-prettier，`globals.node`，spec 单独 `globals.jest`，忽略 generated/dist/.test-dist。ESLint 负责规则，tsc 负责类型，Prettier 负责格式，不初期就堆规则插件。

```js
// project/eslint.config.mjs，辅助包按第4节核实后安装
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', '.test-dist/**', 'coverage/**', 'src/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], languageOptions: { globals: globals.node } },
  { files: ['**/*.spec.ts', 'test/**/*.ts'], languageOptions: { globals: globals.jest } },
  prettier,
];
```

- scripts：新增 `typecheck: "tsc --noEmit -p tsconfig.build.json"`、`lint: "eslint src test --max-warnings=0"`、`format:check: "prettier --check src test"`；test 脚本从 [09](../09-testing/implementation.md) 引入。实施前 Hello World 返回包含尾空格；本次已修正返回值，保留测试对无尾空格问候的预期，不盲目更新快照。
- 命令：`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm test`；先通过新工具再移除旧依赖，安装之后用 pnpm 更新锁文件。
- 预期/验证：不再依赖 vitest/globals；Jest 编译和最小 DI 测试通过，故意制造类型/规则错误可阻断检查。

### 5.5 统一启动与存活接口

- 目标：固定路径，确认应用实际可服务并能平滑关闭。
- 文件：修改 `project/src/main.ts`、`project/test/app.e2e-spec.ts`；新建 `project/src/bootstrap/configure-app.ts`、`project/src/modules/health/health.module.ts`、`health.controller.ts`，在 AppModule 注册。
- 操作：main 在 listen 前通过 configureApp() 设置 `app.setGlobalPrefix('api')`、`app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`，并单独调用 `app.enableShutdownHooks()`；从 ConfigService 获取已验证数字端口和HOST，再 `await app.listen(port, host)`。health controller 使用 `@Controller('health')`，`@Get('live')` 返回 `{ status: 'ok' }`。不检查 DB/Redis，默认版本生成 `/api/v1/health/live`。
- 复用：把前缀/版本等HTTP配置集中到configureApp(app)，由main与E2E在init前调用，03在同一函数增加Pipe/中间件。现有Hello World E2E若保留根Controller则路径改为`/api/v1`；也可改测health路径及status，明确预期后同步，不能继续测未配置前缀的测试应用。
- 命令：`pnpm run build`，`pnpm run start:dev`；另一终端 `curl -i http://localhost:3000/api/v1/health/live`。生产脚本用 `node dist/main.js`，本阶段尚无 Prisma 生成前置。
- 预期/验证：200 + 原始 `{ "status": "ok" }`；阶段03接入包装后变为 `data.status`。启动日志与真实地址一致；SIGTERM 能退出，不出现长时间悬挂。

## 6. 数据库设计

本阶段不连接数据库、不创建表、不运行迁移。DATABASE_URL 可作为示例键预留，阶段02启用时才变成必填；`.env.example` 的 DATABASE_HOST 等拆分键已统一为一份 URL，不能在两处分别维护密码。

## 7. API 设计

| 接口名称 | Method | URL | 请求 | 返回 | 正常码 | 异常码 | 认证 | 权限 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 存活检查 | GET | /api/v1/health/live | 无 | `{status:"ok"}`，03起包装 | 200 | 500 | 公开 | 显式公开 |

测试：`curl -i http://localhost:3000/api/v1/health/live`。本阶段尚无全局认证，05接入时明确 Public；禁止在该接口暴露环境、版本、连接串。

## 8. 验收标准

- [x] 固定版本、单锁文件和忽略规则符合 5.1～5.2。
- [x] typecheck/build/lint/format:check/Jest 最小测试成功。
- [x] 非法 PORT、非法 NODE_ENV、缺失已启用 Observe 凭据均阻断启动。
- [x] 开发启动和构建产物直接 `node dist/main.js` 均成功，health 路径真实返回200。
- [x] SIGTERM 正常退出；生产不依赖个人 .env；真实 Secrets 未提交。

### 8.1 本次验收证据

日期：2026-10-21（Asia/Shanghai）。环境：Darwin arm64，Node 24.18.0、pnpm 11.13.1、Nest 核心/测试 12.1.3、TypeScript 6.0.3、Jest/@jest/globals 30.5.2、ESLint 10.13.0、typescript-eslint 8.72.0、Prettier 3.9.10。

| 工作目录与命令/方法 | 结果与断言 |
| --- | --- |
| project/：pnpm run typecheck、pnpm run typecheck:test | 均退出 0；生产配置只包含 node 类型，测试类型独立 |
| project/：pnpm run build、pnpm run lint、pnpm run format:check | 均退出 0；NodeNext 编译、ESLint 零 warning、源代码/测试格式通过 |
| project/：pnpm test | 退出 0；3 个 suite、27 项断言通过，覆盖配置边界、DI 与 Observe 关闭/缺凭据/开启接线 |
| project/：pnpm run test:e2e | 退出 0；5 项通过，GET /api/v1 与 /api/v1/health/live 返回 200，三个无前缀或无版本路径返回 404 |
| project/：pnpm peers check | 退出 0；移除旧工具后无 peer 冲突 |
| project/：Prettier 额外检查 ESLint/Jest/脚本/测试编译配置、package.json、pnpm-workspace.yaml | 退出 0 |
| 干净临时副本：pnpm install --frozen-lockfile --offline，pnpm peers check，pnpm run build | 均退出 0；无 node_modules、无个人 .env 起步，复用本机 pnpm 缓存，未改写锁文件、无 peer 问题 |
| 干净临时副本：pnpm run start:dev，HTTP GET health | 启动编译成功，200 + {status:"ok"}，日志地址与 /api/v1 一致；验收后停止进程 |
| 干净临时副本：临时注入 TS2322 与 unused variable，再运行 typecheck/lint | 两项均按预期非零退出，证实门禁有效；探针文件已删除 |
| 隔离工作目录：Node 直接运行绝对路径 dist/main.js | 13 项运行断言通过：7 种非法配置、两种 Observe 缺凭据分别非零退出；development 加载临时 .env、production 忽略含非法值的临时 .env，两个模式 health 均 200，SIGTERM 均在 10 秒内退出 |
| 仓库根：git check-ignore、git ls-files 'project/.env*'、git diff --check | 忽略真实/分环境配置与产物，仅 .env.example 被跟踪；差异检查通过 |
| 仓库根：文档静态检查 | 43 个 Markdown 文件、228 个本地链接/锚点、10 份阶段文档章节结构及 manifest 覆盖检查通过 |
| 个人 .env 完整性 | 前后 SHA-256 仅比较，不输出摘要或内容，文件保持一致；运行验收未加载个人 .env |

Observe 真实凭据、远端采集、Linux/其他 CPU、CI 干净机器尚未验证；开启分支使用 SDK mock 验证配置加载顺序和 instrument 传递，不发送真实遥测。Jest VM Modules 的实验性提示是已接受限制。已有跟踪的 .DS_Store 保留，本次仅补忽略规则，没有声称解除跟踪。

首次安装因 pnpm 忽略依赖安装脚本返回非零；审阅后在项目内显式禁止这两项脚本，再安装成功。首次 HTTP E2E 在沙箱内因监听回环端口 EPERM 失败，获得本地端口权限后重跑通过；详见排错记录。以上本地验收不代表阶段 09 的完整测试/CI 已完成。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| ERR_MODULE_NOT_FOUND | 查相对 import `.js`、NodeNext 和 dist 实际路径；不用路径别名掩盖运行时问题 |
| CLI 模板是 Vitest/Oxlint | 现有模板事实，按目标迁移；不能称 Nest12 默认就是 Jest |
| Observe 缺凭据或阻止启动 | 检查开关和模块求值前配置加载，默认关闭后验证 |
| format 因 generated 失败 | 补 .prettierignore，不手改自动生成代码 |
| tsc DTO 未初始化 | 单属性用 `!` 声明由框架赋值，保留 strictPropertyInitialization |

更多见 [初始排错](../troubleshooting/initial-findings.md)。

## 10. 后续扩展

[02 数据库](../02-database/implementation.md) 将增加 DATABASE_URL 校验与生成客户端；[03](../03-api-standards/implementation.md) 接入完整 HTTP 规范。CI、覆盖率和隔离库 E2E 留在09，但每阶段新增测试必须跟随实现。
