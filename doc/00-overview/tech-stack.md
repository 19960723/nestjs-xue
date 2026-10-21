# 技术栈、版本与兼容边界

核实日期：2026-10-21。当前实装与只读核实证据见 [环境记录](environment-audit.md)。本表是后续实施基线，不代表依赖已安装或集成已验证。

## 版本选择

| 技术 | 基线 | 用途与原因 | 兼容/实施条件 |
| --- | --- | --- | --- |
| Node.js | 24.18.0，后续评审同线安全补丁 | 当前本机已装且属于稳定 LTS 线 | Node 官方计划中 26 于 2026-10-28 进入 LTS，今天不提前切换 |
| 包管理 | pnpm 11.13.1 | 现有主锁文件与依赖目录使用 pnpm，降低迁移噪声 | 阶段 01 固定 packageManager；本次保留两个旧锁文件 |
| NestJS | common/core/platform-express/testing 12.1.3；config 12.0.1；CLI 12.0.8 | 沿用现有模块机制与 DI，不无故降级/重建 | Nest 扩展包按各自 peers 选择，不能按 Nest 主版本一律配齐 |
| TypeScript | 6.0.3，strict/NodeNext | 延续已安装编译器和 ESM；开启属性初始化检查 | typescript-eslint 8.72 支持 TS <6.1；不依赖未核实的 ts-jest/TS6 组合 |
| Prisma | CLI/Client/adapter-mariadb 全部 7.10.1 | 7 的稳定 Schema/Migrate 工作流适合当前 MySQL 项目 | 固定正式版本，不用 latest、无版本 npx 或 Prisma 8 RC |
| MySQL | 8.4 LTS，实施时锁补丁和镜像 digest | 满足 MySQL 8.x，生命周期优于 8.0 | 真实服务未检测；字符集 utf8mb4、UTC、InnoDB |
| Redis | 8.x 稳定线，实施时选非 RC 补丁/digest | 缓存和跨实例限流；不存唯一身份事实 | 真实服务未检测；核对托管版本和许可/运维要求 |
| Redis 客户端 | ioredis 6.0.0 | 一套客户端覆盖缓存、原子限流和生命周期 | 不叠加旧 cache-manager-ioredis 适配包，避免版本/TTL 混乱 |
| JWT | @nestjs/jwt 12.0.3 | 复用 Nest 配置注入与签名校验 | 直接编写 Guard，不强制引入 Passport 或新的认证框架 |
| 密码 | argon2 0.45.1，Argon2id | 慢哈希与每密码盐，支持参数提升 | 在目标 Linux/CPU 实测原生模块；禁止复制宿主 node_modules 到容器 |
| OpenAPI | @nestjs/swagger 12.0.2 | DTO 驱动契约与调试 | peers 明确支持 Nest12、TS6；生产默认关闭或受访问控制 |
| 参数校验 | class-validator 0.15.1 / class-transformer 0.5.1 | DTO 运行时校验与显式转换 | TS interface 不能代替运行时 DTO class |
| 测试 | Jest 30.5.2 + @nestjs/testing 12.1.3 + 现有 Supertest 7.3.1 | 按用户目标从 Vitest 迁移 | 采用 tsc 预编译测试后 Jest 执行 ESM，详见阶段 09 |
| 质量 | ESLint 10.13.0 / typescript-eslint 8.72.0 / Prettier 3.9.10 | 静态规则、类型检查、格式各司其职 | flat config；@eslint/js、globals 等辅助包安装前核实正式补丁与 peers |
| 限流 | @nestjs/throttler 6.7.1 | 集成 Nest Guard 与策略元数据 | TTL 按该版毫秒；共享 Redis storage 需实际匹配接口 |
| 定时任务 | @nestjs/schedule 12.0.2 | 简单周期清理与可控调度 | 多副本不能默认每实例执行同一任务 |
| 容器 | Docker 29.6.1 / Compose 5.3.0（本机） | 可复现依赖、构建和部署 | Compose 文件不写废弃顶层 version；运行镜像单独固定 digest |

新增依赖全部用 `pnpm add --save-exact` 或 `-DE`。辅助包未核实精确补丁时，先运行只读 `pnpm view <包> version engines peerDependencies --json`，确认正式版后使用返回版本精确安装，并回填本表和锁文件。不得用 `--force` 绕过 peers。Redis/MySQL 镜像 tag 只是候选线，发布前固定实际验证的 digest。

## Prisma 7 专用约束

1. 采用 `prisma-client`，输出 `project/src/generated/prisma`，声明 `moduleFormat = "esm"`、`generatedFileExtension = "ts"`、`importFileExtension = "js"`。经 tsc 生成 JS，由 Node 运行；不把 tsx 示例的 `.ts` 导入混入此构建路径。
2. 7.10 新初始化优先 `project/prisma7.config.ts`，通过 `prisma/config` 配置 URL 和迁移目录并显式加载 dotenv；Schema 的 datasource 只写 provider，不照搬 Prisma 6 的 URL 写法。
3. 使用 `@prisma/adapter-mariadb` 的 `PrismaMariaDb` 连接 MySQL。这个包名不意味着把数据库换成 MariaDB。CLI 使用 DATABASE_URL，运行时从同一 URL 解析 adapter 参数，避免双份连接配置漂移。
4. CLI、@prisma/client、adapter 精确同版；每次 schema 改动后显式 generate，再 build。运行时从生成目录导入 client，不能改回旧 `@prisma/client` 生成入口示例。
5. 不套用 Prisma 8 的 CLI、连接库、错误码或迁移语法。官方目前将 8 标为 RC，且 CLI 的 latest 已可能指向 8；即使未来 GA，也要单独做兼容 ADR。

## ESM 与 Jest 的取舍

保持 package `type: module` 和 TypeScript NodeNext，源代码相对 import 写 `.js`；类型 import 使用 `import type`。不为测试把业务代码切回 CommonJS。Jest 先用项目 TypeScript 编译测试到 `.test-dist`，再以 VM modules 执行 JS，因此保留 Nest 所需装饰器元数据，并避开 TS6 transformer 兼容性假设。Jest 官方仍标注 ESM 支持实验性，这是当前方案明确接受并需在 CI 验证的限制；详见 [ADR 0003](../decisions/0003-tooling-alignment.md)。

## 官方依据

- [Node.js 发布日程](https://github.com/nodejs/Release/blob/main/schedule.json)：按日期判断 LTS，不将 Current 视为生产基线。
- [Prisma 发布状态](https://www.prisma.io/docs/orm/release-status)、[Prisma 7 MySQL 快速入门](https://www.prisma.io/docs/v7/prisma-orm/quickstart/mysql)、[生成器字段](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)：版本线、配置名、adapter 和输出方式。
- [MySQL LTS 策略](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html)、[MySQL 支持公告](https://www.mysql.com/support/eol-notice.html)：8.0 已在 2026-04 转入 Sustaining Support，选择 8.4。
- [typescript-eslint 支持矩阵](https://typescript-eslint.io/users/dependency-versions/)、[Jest ESM](https://jestjs.io/docs/ecmascript-modules)：质量链和测试运行边界。
- 精确包版本/peers 来自 npm 官方 registry 只读元数据，见环境记录。官方教程中的配置需结合本仓库 NodeNext 和实际版本适配，不能整段混抄。
