# 项目总览

更新：2026-10-24（Asia/Shanghai）。文档状态：已更新；整体功能：进行中。阶段 01 有历史本地验收记录，02～04 已有数据库、基础 CRUD 与 Swagger 实现，bootstrap 整理已落地，数据库业务未验收；认证与授权仍计划中。

目标是建立可持续维护的 NestJS 模块化单体后端，以用户管理、身份认证、RBAC 为第一条业务链。部署单元是一个 API 应用、一套 MySQL 和按阶段接入的 Redis；通过模块边界支持以后增加订单等业务，不预先拆微服务。

## 历史实施与当前现状

2026-10-21 阶段 01 已在用户明确授权后完成：统一 pnpm、完整 strict、配置校验、Observe 默认关闭、Jest/ESLint 迁移及健康接口；当时本地构建、测试、启动、配置隔离与退出已验收，该次未连接数据库、执行迁移、启动容器或部署。最初文档初始化的历史记录见 CHG-20261021-001，阶段 01 实施见 CHG-20261021-002。

2026-10-22：用户另行授权安装 Prisma CLI/Client/adapter-mariadb，三者精确 7.10.1；安装、脚本审批、CLI 版本、peer 检查与现有项目构建通过。阶段 02 进入依赖准备，数据库集成未验收；用户已有/并行新增的 Schema、配置和其他依赖保留，本次不执行 generate 或数据库操作。见 [CHG-20261022-001](../changelog/2026-10-22-001-prisma-dependencies.md)。

2026-10-23 当前静态盘点：存在 PrismaModule/Service、User/Role/UserRole Schema、两份迁移文件和生成客户端；UsersModule 已有基础 CRUD，现有接口 Swagger 装饰器有局部历史验收记录。迁移是否应用、实际 MySQL 版本、约束/事务及数据库业务运行状态待确认。Swagger 测试文件随后按用户要求删除，当前暂不运行测试；历史结果见 [CHG-20261023-001](../changelog/2026-10-23-001-swagger-decorators.md)。本次整理只更新文档，实施顺序见[路线图](roadmap.md#当前整理实施顺序)。

| 已有资产 | 证据 | 状态与限制 |
| --- | --- | --- |
| NestJS 项目 | `project/package.json`、`project/src/` | 已有骨架；阶段 01 开发启动与构建产物均已本地验证 |
| ESM 与严格模式 | `type: module`、NodeNext、`strict: true` | 已验证配置，属性初始化检查已开启 |
| 环境加载 | `ConfigModule.forRoot()`、`.env.example` | 已验证加载与启动校验；production/test 忽略 .env，个人文件仅校验完整性 |
| Observe | createAppModule() 按已校验开关动态加载 | 默认关闭，关闭/缺凭据/模拟开启接线已验证；真实凭据与采集未验证 |
| 数据库集成 | `src/database/prisma/`、`prisma/schema.prisma`、`prisma/migrations/` | 02 进行中；已有代码与文件，应用历史和真实数据库行为未验收；目标差异见阶段 02 |
| 用户与接口 | `src/modules/users/`、configureApp 中的 ValidationPipe、configureSwagger、控制器装饰器 | 03/04 进行中；Pipe/Swagger 已提取，运行行为未验收；基础 CRUD 为硬删除，尚无统一包装、软删或响应字段白名单；OpenAPI 模型不自动过滤运行时输出 |
| 认证与授权 | Role/UserRole 数据模型；尚无 Auth/Authorization 模块 | 05/06 计划中；存在关联表不表示登录、Guard 或 RBAC 已实现 |
| 测试与质量 | Jest、ESLint、Prettier | 阶段 01 历史结果为 27 项单元、5 项 HTTP E2E；当前接入数据库后未复验，业务集成/完整 CI 留在 09 |
| 旧学习笔记 | [历史目录](../legacy/README.md) | 已归档；原五阶段顺序及示例不再用于实施 |

阶段 01 当时的工作区和验收范围见其第 8 节。当前工作区已有用户未提交修改，本次文档整理予以保留；不将历史本地通过扩大为当前代码、CI、Linux 或后续业务已验证。

2026-10-23 移动后复核：users 已移入 modules/users，Prisma 已移入 database/prisma，当前路径无需继续调整。检查期间删除了 AppController/AppService，用户已清理 AppModule 引用，最新生产/测试代码类型检查通过；旧 E2E 问候断言已删除，最新静态类型检查和构建通过，未运行测试。见[整理检查记录](../changelog/2026-10-23-002-project-organization.md#目录移动后检查2026-10-23)。

## 最近一次进度复核（2026-10-24）

本轮核对源码、Schema、依赖、阶段文档及最新变更记录，只补充文档进度，没有修改应用代码。Git HEAD 仍为 5dd53a7；bootstrap 及配套文档修改尚未提交，保留现有工作区。

- 已落地：当前目录为 modules/users、modules/health、database/prisma、bootstrap/config；bootstrap 两函数已统一读取已校验配置，并由 main 在 listen 成功后输出实际地址。该内部整理已有类型/构建/静态质量证据，HTTP 开关和地址行为未验收。
- 02 待办：CLI 使用 DATABASE_URL、runtime 仍使用独立字段，配置未统一；build 未串联 generate。Schema 和两份迁移文件存在，但迁移应用、实际数据库版本、连接关闭及事务约束未验收；User 目标字段/回填方案仍待明确。
- 03 待办：全局 Pipe 和 Swagger 已有代码，统一响应/异常、requestId 与完成日志尚未实现；不能把 Swagger 装饰器验证当作全部 API 规范完成。
- 04 待办：已有 5 个基础 CRUD 操作、分页与搜索，当前为硬删除，Service 直接查询并返回 Prisma 记录；软删、public select、状态管理、Repository 及业务验收仍待补齐。
- 05～10：认证、授权行为、Redis、公共能力增强、完整测试/CI、部署运维仍计划中；Role/UserRole 模型不代表 RBAC 已实现，Jest/ESLint 最小工具已在 01 落地不代表 09 完成。

当日复核环境：Darwin arm64、Node 24.18.0、pnpm 11.13.1；工作目录 project/。生产/测试代码的无输出类型检查、build、全仓 lint 均退出 0；format:check 退出 1，剩余 database/prisma/prisma.module.ts、database/prisma/prisma.service.ts、modules/users/users.service.ts、test/app.e2e-spec.ts 四个文件需格式化。仓库根目录 git diff --check 退出 0。命令详见[bootstrap 后续复核记录](../changelog/2026-10-23-003-bootstrap-organization.md#进度复核2026-10-24)。

继续遵守暂不运行测试的约定，本轮未执行 Jest、HTTP、数据库连接/迁移、generate、安装或部署；构建使用本地已有生成客户端，不证明干净检出或数据库可运行。下一步优先补齐 02 的配置、生成链路与目标模型差异，再推进 03/04 的缺口，执行范围另按具体任务确定。

## 角色资源 CRUD（2026-10-30）

用户授权补齐角色列表、详情、更新、删除，不统一 DATABASE_URL、不改 User 模型、不实现认证授权。RolesService 已去掉脚手架字符串；列表接入 QueryRoleDto，公开字段白名单与 create 一致，已分配用户的角色删除返回 409。类型/构建/目标文件静态检查见 [CHG-20261030-001](../changelog/2026-10-30-001-role-resource-crud.md)。数据库与 HTTP 行为未验收；完整 RBAC 仍计划中。

## 功能分级

| 分级 | 范围 | 交付边界 |
| --- | --- | --- |
| 初期必须 | 配置校验、数据库迁移、DTO/异常/响应、用户 CRUD、密码哈希、JWT/会话撤销、RBAC、测试、Secrets、健康检查 | 形成可发布闭环；认证授权未完成前用户管理只允许隔离本地开发 |
| 企业项目推荐 | Redis 共享限流、结构化日志、审计、上传安全、CI、备份恢复演练、监控告警 | 对外部署前完成与实际功能相关的项；上传未启用时可延后 |
| 按需求扩展 | 多租户、SSO/MFA、消息队列、事务 outbox、缓存事件广播、搜索、微服务 | 有明确容量/业务需求再立 ADR，不一次引入 |

## 交付方式

先按[当前整理实施顺序](roadmap.md#当前整理实施顺序)收拢已有实现，再按阶段依赖补齐。每阶段先读完整文档，对已存在模块原地调整，执行有条件的命令；新的数据库变动仍须明确范围。阶段中标为 P0 的项目是该阶段的门槛，P1 为推荐，P2 为扩展。

阶段 04 已有基础代码，但其前置 02/03 的数据、错误与校验门槛尚未全部满足，应先补齐，不能因 CRUD 已存在而跳过。进入对外部署前阶段 05～07 的安全能力、阶段 09 的流水线和阶段 10 的恢复演练必须完成。密码重置在未配置可信交付渠道前保持关闭，不能返回 token 假装完成。

## 待确认的产品与运维决策

1. 已在阶段 01 确认采用 pnpm、Jest/ESLint，npm 锁文件经审阅移除；这项工程选择已落地，其余产品与运维决策见下列各项。
2. 默认 ID 为 Int 自增；账号/邮箱大小写归一化，软删后永久占用唯一身份。若需账号复用、超大规模 ID 或多租户，先改数据 ADR。
3. 默认 API 客户端用 JSON 交换 Refresh Token；浏览器产品上线前改为 HttpOnly Cookie 并补 CSRF、跨站点策略与契约测试。
4. 自助注册默认关闭，通过配置显式启用；密码重置交付渠道（邮件或其他可信渠道）、管理员初始账号来源待业务确认。
5. 默认单机 Compose 教学与小规模部署；生产是否使用托管 MySQL/Redis、对象存储、目标域名/HTTPS、RPO/RTO 待确认。

这些默认方案足以继续文档工作；涉及真实部署或产品交付的未决项应在相关阶段验收前确定。完整版本和来源见 [技术栈](tech-stack.md)。
