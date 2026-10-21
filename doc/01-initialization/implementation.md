# 阶段 01：环境准备与项目初始化

更新：2026-10-21。文档状态：已编写。功能状态：进行中（已有骨架，尚未按本方案验收）。前置：[环境记录](../00-overview/environment-audit.md)。命令默认在 `project/` 执行，均为后续手动操作。

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

ConfigModule 的 validate 在加载时运行；顶层代码读取环境可能发生在它之前。现有 Observe 顶层读取凭据，必须先解决加载顺序并明确开关。安装/配置路径依据 [Nest 配置](https://docs.nestjs.com/techniques/configuration) 和本地代码，不因 `.env` 存在就认为启动校验已完成。

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
```

已核实的主体工具可精确安装：

```bash
pnpm add -DE eslint@10.13.0 typescript-eslint@8.72.0 jest@30.5.2
```

辅助包使用刚查询且兼容的正式精确版本 `pnpm add -DE 包名@版本`，然后更新技术栈表。不要不经核实直接复制占位版本。Jest 的具体配置与脚本在 [09 的 5.1](../09-testing/implementation.md#51-迁移测试运行器与编译配置)，本阶段就要完成最小迁移，不等第 09 阶段。

## 5. 详细实施步骤

### 5.1 固定环境并接管已有项目

- 目标：保留已有代码与本地改动，避免重复初始化。
- 文件：修改 `project/package.json`，新建 `project/.nvmrc`；审阅 `project/pnpm-lock.yaml` 和 `project/package-lock.json`。
- 操作：在 .nvmrc 写 `24.18.0`；package 加 `packageManager: "pnpm@11.13.1"`、engines node `>=24.18.0 <25`。统一 Nest 核心到表中同一补丁。确认 npm 锁文件没有需要保留的独有变更，再在本阶段实施时移除它，只保留 pnpm 锁文件并记录。不要删除当前用户改动。
- 命令：仓库根 `git status --short`；项目目录 `pnpm exec nest --version`。已有项目不运行 `nest new`。仅全新空目录场景用固定 CLI 创建，并先检查新模板是否又带回 Vitest/Oxlint。
- 预期/验证：`pnpm list --depth 0` 与锁文件、版本表一致；在干净 CI 用 `pnpm install --frozen-lockfile` 成功。安装动作属于用户后续执行，本次未做。

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

- 解释：这是最小端口/环境片段，需补 LOG_LEVEL 枚举和布尔字面量校验，再 `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`。严格拒绝非 true/false 的开关。生产从运行环境注入，不加载开发 .env；可用 `ignoreEnvFile: process.env.NODE_ENV === 'production'`，由部署时传入 NODE_ENV。
- Observe：默认关闭，关闭时不注册 ObserveModule、不传 instrument、不需要 appKey/appSecret。开启时先加载配置并校验凭据，再导入/初始化应用模块。可在入口显式加载 dotenv 后动态导入 AppModule；具体 instrument 接线以当前安装包 API 验证，不能只删一个 import 破坏应用。
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

- scripts：新增 `typecheck: "tsc --noEmit -p tsconfig.build.json"`、`lint: "eslint src test --max-warnings=0"`、`format:check: "prettier --check src test"`；test 脚本从 [09](../09-testing/implementation.md) 引入。现有 Hello World 返回包含尾空格，明确选择修正返回或按产品期望更新测试，留下变更说明，不盲目更新快照。
- 命令：`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm test`；先通过新工具再移除旧依赖，安装之后用 pnpm 更新锁文件。
- 预期/验证：不再依赖 vitest/globals；Jest 编译和最小 DI 测试通过，故意制造类型/规则错误可阻断检查。

### 5.5 统一启动与存活接口

- 目标：固定路径，确认应用实际可服务并能平滑关闭。
- 文件：修改 `project/src/main.ts`、`project/test/app.e2e-spec.ts`；新建 `project/src/bootstrap/configure-app.ts`、`project/src/modules/health/health.module.ts`、`health.controller.ts`，在 AppModule 注册。
- 操作：main 在 listen 前 `app.setGlobalPrefix('api')`、`app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`、`app.enableShutdownHooks()`；从 ConfigService 获取已验证数字端口和HOST，再 `await app.listen(port, host)`。health controller 使用 `@Controller('health')`，`@Get('live')` 返回 `{ status: 'ok' }`。不检查 DB/Redis，默认版本生成 `/api/v1/health/live`。
- 复用：把前缀/版本等HTTP配置集中到configureApp(app)，由main与E2E在init前调用，03在同一函数增加Pipe/中间件。现有Hello World E2E若保留根Controller则路径改为`/api/v1`；也可改测health路径及status，明确预期后同步，不能继续测未配置前缀的测试应用。
- 命令：`pnpm run build`，`pnpm run start:dev`；另一终端 `curl -i http://localhost:3000/api/v1/health/live`。生产脚本用 `node dist/main.js`，本阶段尚无 Prisma 生成前置。
- 预期/验证：200 + 原始 `{ "status": "ok" }`；阶段03接入包装后变为 `data.status`。启动日志与真实地址一致；SIGTERM 能退出，不出现长时间悬挂。

## 6. 数据库设计

本阶段不连接数据库、不创建表、不运行迁移。DATABASE_URL 可作为示例键预留，阶段02启用时才变成必填；目前 `.env.example` 的 DATABASE_HOST 等拆分键计划统一为一份 URL，不能在两处分别维护密码。

## 7. API 设计

| 接口名称 | Method | URL | 请求 | 返回 | 正常码 | 异常码 | 认证 | 权限 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 存活检查 | GET | /api/v1/health/live | 无 | `{status:"ok"}`，03起包装 | 200 | 500 | 公开 | 显式公开 |

测试：`curl -i http://localhost:3000/api/v1/health/live`。本阶段尚无全局认证，05接入时明确 Public；禁止在该接口暴露环境、版本、连接串。

## 8. 验收标准

- [ ] 固定版本、单锁文件和忽略规则符合 5.1～5.2。
- [ ] typecheck/build/lint/format:check/Jest 最小测试成功。
- [ ] 非法 PORT、非法 NODE_ENV、缺失已启用 Observe 凭据均阻断启动。
- [ ] 开发启动和构建产物直接 `node dist/main.js` 均成功，health 路径真实返回200。
- [ ] SIGTERM 正常退出；生产不依赖个人 .env；真实 Secrets 未提交。

验收记录：未执行；仅现有骨架/配置的静态盘点完成，不能据此标本阶段已验证。

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
