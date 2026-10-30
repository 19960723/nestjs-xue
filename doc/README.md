# 项目技术文档导航

更新：2026-10-30（Asia/Shanghai）。文档体系：已初始化；应用整体：进行中。阶段 01 有历史本地验收；02～04 已有数据库、基础 CRUD 和 Swagger 实现，完整阶段及数据库业务仍未验收。角色资源 CRUD 已落地，授权未实现；详见[角色资源 CRUD](00-overview/project-overview.md#角色资源-crud2026-10-30)。

## 从这里开始

1. [项目目标与现状](00-overview/project-overview.md)
2. [环境检查证据](00-overview/environment-audit.md)与[技术栈/兼容基线](00-overview/tech-stack.md)
3. [架构与模块依赖](00-overview/architecture.md)
4. [路线图、阶段依赖与第一阶段任务](00-overview/roadmap.md)
5. [文档驱动开发与状态规范](00-overview/documentation-workflow.md)

所有阶段文档按十个章节组织。P0为阶段必需、P1推荐、P2扩展。命令默认在 project/ 运行，执行记录见各阶段验收节；未实施阶段的命令仍为未来示例。必须先读前置条件，数据库/安装/部署不会因示例存在就被自动执行。

## 阶段导航与功能进度

| 阶段 | 实施文档 | 文档状态 | 功能状态 | 依赖 |
| --- | --- | --- | --- | --- |
| 01 | [环境与初始化](01-initialization/implementation.md) | 已更新 | 已验证（本地） | 环境盘点 |
| 02 | [MySQL与Prisma7](02-database/implementation.md) | 已更新 | 进行中（已有集成代码，数据库未验收） | 01 |
| 03 | [API规范与可观测性基础](03-api-standards/implementation.md) | 已更新 | 进行中（现有接口 Swagger 已本地验证） | 01/02 |
| 04 | [用户管理CRUD](04-user-management/implementation.md) | 已更新 | 进行中（已有基础 CRUD，数据库业务未验收） | 02/03 |
| 05 | [身份认证与会话](05-authentication/implementation.md) | 已编写 | 计划中 | 04 |
| 06 | [RBAC授权](06-authorization/implementation.md) | 已更新 | 计划中（角色资源 CRUD 已实现，数据库行为未验收，授权未实现） | 05 |
| 07 | [Redis缓存与共享限流](07-redis/implementation.md) | 已编写 | 计划中 | 04～06 |
| 08 | [公共能力与审计](08-common/implementation.md) | 已编写 | 计划中 | 02～07 |
| 09 | [测试质量与CI](09-testing/implementation.md) | 已更新 | 计划中（最小工具已在01验证，当前测试执行暂缓） | 01～08 |
| 10 | [部署与运维](10-deployment/implementation.md) | 已编写 | 计划中 | 07～09 |

状态只用「计划中、进行中、已实现、已验证」描述功能；文档写完不表示对应功能已实现。已验证必须附日期/版本/命令/结果。阶段 01 的版本、启动与质量验收见其第 8 节；环境盘点保留实施前快照与实施后摘要。历史验收仅覆盖记录当时的代码及范围，后续接入数据库后的启动与 E2E 状态仍需复验；Swagger 局部验证也不代表整个阶段完成。

## 决策、维护与记录

- [ADR索引](decisions/README.md)：模块化单体、Prisma7/ESM、工具迁移、安全/数据策略；0003 工具迁移已接受，其余为提议。
- [变更索引](changelog/README.md)：长期实质性变更记录。
- [排错索引](troubleshooting/README.md)：已知静态差异和后续可复用问题。
- 模板：[阶段](templates/stage-template.md)、[ADR](templates/adr-template.md)、[变更](templates/change-template.md)、[排错](templates/troubleshooting-template.md)。
- [完整文档文件清单](manifest.md)与[历史笔记映射](legacy/README.md)。

根[AGENTS.md](../AGENTS.md)只保存核心规则；维护细节以[流程规范](00-overview/documentation-workflow.md)为准。代码改动前先更新原阶段，架构/数据库/API/依赖变化同步更新对应事实源，完成后验收和记变更。

## 下一步

先按[整理实施顺序](00-overview/roadmap.md#当前整理实施顺序)推进：文档校准 → 启动与配置收拢 → 目录移动 → 用户与数据模型调整 → 验证闭环。bootstrap 配置读取与日志已由用户单独授权代理实现，通过类型/构建/静态质量检查；数据库及其他任务仍按原范围推进，逐项补验收。已有 Schema、迁移文件、生成客户端和 Prisma 模块应原地调整，不重复初始化或生成业务骨架。迁移应用历史及数据库运行状态待阶段 02 核对验收。

针对 src 当前文件数量，按[最小整理方案](00-overview/architecture.md#src-当前规模的最小整理方案)收拢：根目录保留 main/app.module，业务统一 modules，Prisma 源模块已归入 database/prisma，无需为目录风格再次移动，生成客户端保持原位；只实现当前需要的目录。

沿用 pnpm、Prisma7/MySQL8.4 基线与现有 ESM；产品侧需在相关阶段确认身份复用、注册/重置渠道、客户端 token 存储、部署与备份目标，见[待确认事项](00-overview/project-overview.md#待确认的产品与运维决策)。
