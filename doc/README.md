# 项目技术文档导航

更新：2026-10-21（Asia/Shanghai）。文档体系：已初始化；应用整体：进行中，仅有初始骨架。本次没有业务开发、安装、迁移或部署。

## 从这里开始

1. [项目目标与现状](00-overview/project-overview.md)
2. [环境检查证据](00-overview/environment-audit.md)与[技术栈/兼容基线](00-overview/tech-stack.md)
3. [架构与模块依赖](00-overview/architecture.md)
4. [路线图、阶段依赖与第一阶段任务](00-overview/roadmap.md)
5. [文档驱动开发与状态规范](00-overview/documentation-workflow.md)

所有阶段文档按十个章节组织。P0为阶段必需、P1推荐、P2扩展。命令默认在project/运行，均是未来实施示例；必须先读前置条件，数据库/安装/部署不会因示例存在就被自动执行。

## 阶段导航与功能进度

| 阶段 | 实施文档 | 文档状态 | 功能状态 | 依赖 |
| --- | --- | --- | --- | --- |
| 01 | [环境与初始化](01-initialization/implementation.md) | 已编写 | 进行中：骨架已有，未验收 | 环境盘点 |
| 02 | [MySQL与Prisma7](02-database/implementation.md) | 已编写 | 计划中 | 01 |
| 03 | [API规范与可观测性基础](03-api-standards/implementation.md) | 已编写 | 计划中 | 01/02 |
| 04 | [用户管理CRUD](04-user-management/implementation.md) | 已编写 | 计划中 | 02/03 |
| 05 | [身份认证与会话](05-authentication/implementation.md) | 已编写 | 计划中 | 04 |
| 06 | [RBAC授权](06-authorization/implementation.md) | 已编写 | 计划中 | 05 |
| 07 | [Redis缓存与共享限流](07-redis/implementation.md) | 已编写 | 计划中 | 04～06 |
| 08 | [公共能力与审计](08-common/implementation.md) | 已编写 | 计划中 | 02～07 |
| 09 | [测试质量与CI](09-testing/implementation.md) | 已编写 | 计划中（最小工具先在01） | 01～08 |
| 10 | [部署与运维](10-deployment/implementation.md) | 已编写 | 计划中 | 07～09 |

状态只用「计划中、进行中、已实现、已验证」描述功能；文档写完不表示对应功能已实现。已验证必须附日期/版本/命令/结果。现有配置等“已实现”子项见环境盘点，尚未按新标准执行应用验收。

## 决策、维护与记录

- [ADR索引](decisions/README.md)：模块化单体、Prisma7/ESM、工具迁移、安全/数据策略，当前均为提议。
- [变更索引](changelog/README.md)：长期实质性变更记录。
- [排错索引](troubleshooting/README.md)：已知静态差异和后续可复用问题。
- 模板：[阶段](templates/stage-template.md)、[ADR](templates/adr-template.md)、[变更](templates/change-template.md)、[排错](templates/troubleshooting-template.md)。
- [完整文档文件清单](manifest.md)与[历史笔记映射](legacy/README.md)。

根[AGENTS.md](../AGENTS.md)只保存核心规则；维护细节以[流程规范](00-overview/documentation-workflow.md)为准。代码改动前先更新原阶段，架构/数据库/API/依赖变化同步更新对应事实源，完成后验收和记变更。

## 下一步

先做[阶段01](01-initialization/implementation.md)：版本/双锁审阅、strict、配置校验、Observe可选开关、Jest/ESLint迁移、/api/v1健康入口和质量验收。默认pnpm、Prisma7/MySQL8.4与现有ESM；产品侧需在相关阶段确认身份复用、注册/重置渠道、客户端token存储、部署与备份目标，见[待确认事项](00-overview/project-overview.md#待确认的产品与运维决策)。
