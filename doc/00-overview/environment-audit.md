# 环境与仓库检查记录

检查日期：2026-10-21（Asia/Shanghai）。下面原始盘点保留文档初始化时的只读快照，不代表当前工具链。阶段 01 实施后摘要见末节；完整验收证据见阶段 01 第 8 节。

## 本地环境

| 项目 | 检测命令/方法 | 实测 | 结论 |
| --- | --- | --- | --- |
| 工作目录 | `pwd` | `/Users/lxl/lxl/init-xue-nestjs` | Git 仓库，代码在 project/ |
| Node.js | `node --version` | 24.18.0 | 采用本机已装的 24 LTS 线 |
| npm | `npm --version` | 11.16.0 | 可用，但建议统一 pnpm |
| pnpm | `pnpm --version` | 11.13.1 | 可用，存在 pnpm 锁文件 |
| Corepack / Yarn | `corepack --version` / `yarn --version` | 0.35.0 / 1.22.22 | 可用，不作为项目额外包管理器 |
| Nest 全局 CLI | `command -v nest` | 不在 PATH | 已有本地 CLI 12.0.8，无需全局安装 |
| MySQL CLI | `command -v mysql` | 不在 PATH | 不能推断本地/容器/远程服务不存在；服务版本、连通性待确认 |
| Redis CLI | `command -v redis-cli` | 不在 PATH | 服务版本、连通性待确认 |
| Docker CLI | `docker --version` | 29.6.1 | 可用 |
| Docker Compose | `docker compose version` | 5.3.0 | 可用，后续使用 Compose Specification |
| Docker 引擎 | `docker info --format '{{.ServerVersion}}'` | 29.6.1 | 最初沙箱 socket 拒绝，获准的只读查询成功 |

未执行 `docker compose up`、镜像拉取、数据库登录/SQL、迁移、应用启动、构建、测试和依赖安装。未读取真实 `.env` 的值。未检测数据库已有数据，不具备执行初始化/重置数据库的依据。

## 已安装依赖（读取 node_modules/package.json）

| 依赖 | 实装版本 | 备注 |
| --- | --- | --- |
| @nestjs/common / core / platform-express / testing | 12.1.3 | package 范围 ^12.0.1；核心 peer 要求 12.x |
| @nestjs/config | 12.0.1 | peer 支持 Nest 11/12 |
| @nestjs/cli | 12.0.8 | 本地可用 |
| TypeScript | 6.0.3 | package 范围 ^6.0.2 |
| Vitest | 4.1.12 | 现有 test 脚本使用它 |
| Oxlint | 1.88.0 | 现有 lint 脚本使用它 |
| Prettier | 3.9.10 | 已安装 |
| Prisma / @prisma/client / Jest / ESLint | 未安装 | 后续阶段才引入 |

pnpm-lock 的 importer 与新增 config/dotenv 相符；package-lock 仍记录旧的 core 12.0.1 和缺少 config/dotenv 的根依赖快照。当前存在两个锁文件及用户修改，本次不移除、不重写。后续阶段 01 才统一。

## 远程版本核实（不是安装结果）

以只读 HTTPS 查询 npm 官方 registry 的指定版本或 latest 元数据，2026-10-21 得到：

| 包 | 核实版本 | 关键兼容信息 |
| --- | --- | --- |
| prisma / @prisma/client / @prisma/adapter-mariadb | 7.10.1（三项分别核实返回 200） | CLI/Client Node `^20.19 \|\| ^22.12 \|\| >=24.0`，TS >=5.4 |
| @nestjs/swagger | 12.0.2 | Nest ^12，TS ^5.5 或 ^6 |
| @nestjs/jwt | 12.0.3 | Nest 8～12 |
| @nestjs/throttler | 6.7.1 | Nest 7～12，Node 24 满足范围 |
| @nestjs/schedule | 12.0.2 | Nest 11/12 |
| class-validator / class-transformer | 0.15.1 / 0.5.1 | 后续 DTO 依赖 |
| Jest | 30.5.2 | Node >=24 在支持范围 |
| ESLint / typescript-eslint | 10.13.0 / 8.72.0 | typescript-eslint 支持 ESLint 10，TS >=4.8.4 <6.1 |
| ioredis | 6.0.0 | Node >=20 |
| argon2 | 0.45.1 | Node >=16.17；目标容器原生模块仍需实测 |

来源为 [npm Registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)，例如 [Prisma 指定版本元数据](https://registry.npmjs.org/prisma/7.10.1)、[Swagger 元数据](https://registry.npmjs.org/@nestjs%2Fswagger/12.0.2)、[typescript-eslint 元数据](https://registry.npmjs.org/typescript-eslint/8.72.0)。这些是版本/peer 的声明验证，不是整个依赖树安装、编译或数据库运行验证。完整验收留到对应阶段；未查询的辅助包补丁版不能宣称已核实。

## 静态发现与处理范围

- main 日志显示 `/api`，但没有 setGlobalPrefix；当前实际入口是 `/`。后续在阶段 01 明确前缀和版本，不能依赖日志判断路由。
- AppService 返回 `Hello World! `（含尾随空格），两个测试期望 `Hello World!`；只是静态发现，本次未运行、未修改。
- ConfigModule 已加载 .env，但 Observe 的 `process.env` 读取发生在模块求值阶段；不能假定 ConfigModule 已先加载环境。后续需要初始化顺序验证和可选开关。
- `strict: true` 同时 `strictPropertyInitialization: false`；阶段 01 计划开启，并使用 DTO `!` 与 DI 构造函数明确初始化。
- 根级缺少 .gitignore，存在 .DS_Store 和已跟踪的 project/.DS_Store；后续加 ignore 不会自动解除已跟踪文件，不能声称已清理。

这些事项均已写入阶段 01 或 [初始排错记录](../troubleshooting/initial-findings.md)，保持用户代码原样。

## 阶段 01 实施后状态（2026-10-21）

用户已授权按阶段 01 实施，工作区开始时干净。Node/pnpm 仍为 24.18.0/11.13.1；Nest 核心/测试固定 12.1.3、CLI 12.0.8、TS 6.0.3、Prettier 3.9.10，新增 Jest/@jest/globals 30.5.2、ESLint 10.13.0、typescript-eslint 8.72.0 及精确辅助依赖。当前仅有 pnpm 锁文件；原始双锁快照保留在上文。

属性初始化检查已开启，测试 types 独立。配置工厂先校验再加载可选 Observe；production/test 不读取 .env。/api/v1 与 /api/v1/health/live 已实现。Hello World 尾空格已修正，Vitest/Oxlint 及旧配置已移除。

本地 typecheck/typecheck:test/build/lint/format:check、27 项单元测试、5 项 HTTP E2E、13 项运行断言、干净副本 frozen-lockfile 离线安装及开发启动均通过；pnpm peers check 无冲突。数据库、Redis、容器、部署、真实 Observe 采集与 CI 未执行。个人 .env 仅前后比较完整性，没有输出内容或摘要。详见 [阶段 01 验收](../01-initialization/implementation.md#8-验收标准)与 [CHG-20261021-002](../changelog/2026-10-21-002-initialization.md)。

## Prisma 依赖安装后状态（2026-10-22）

Node24.18.0/pnpm11.13.1/TS6.0.3 保持原基线。用户授权的 prisma、@prisma/client、@prisma/adapter-mariadb 均精确安装 7.10.1，Node/TS 条件满足官方包声明。项目级仅允许 Prisma 必需安装脚本，禁止 Scarf 安装统计并保留 watcher/resolver 禁止策略。

frozen-lockfile 安装、Prisma 脚本 rebuild、peer 检查、隔离配置的 CLI 版本查询、adapter ESM 导入和现有 build 均退出 0；未读取个人 .env，未生成客户端或操作数据库。上文“未安装”是最初快照，当前安装事实以本节及 [CHG-20261022-001](../changelog/2026-10-22-001-prisma-dependencies.md) 为准，数据库集成仍未验收。
