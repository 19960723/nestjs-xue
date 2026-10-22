# 项目技术文档导航

更新：2026-10-22（Asia/Shanghai）。文档体系：已初始化；应用整体：进行中。阶段 01 已完成本地验收；阶段 02 已开始安装依赖，数据库集成与业务未验收。

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
| 02 | [MySQL与Prisma7](02-database/implementation.md) | 已更新 | 进行中（仅依赖安装） | 01 |
| 03 | [API规范与可观测性基础](03-api-standards/implementation.md) | 已编写 | 计划中 | 01/02 |
| 04 | [用户管理CRUD](04-user-management/implementation.md) | 已编写 | 计划中 | 02/03 |
| 05 | [身份认证与会话](05-authentication/implementation.md) | 已编写 | 计划中 | 04 |
| 06 | [RBAC授权](06-authorization/implementation.md) | 已编写 | 计划中 | 05 |
| 07 | [Redis缓存与共享限流](07-redis/implementation.md) | 已编写 | 计划中 | 04～06 |
| 08 | [公共能力与审计](08-common/implementation.md) | 已编写 | 计划中 | 02～07 |
| 09 | [测试质量与CI](09-testing/implementation.md) | 已编写 | 计划中（最小工具已在01验证） | 01～08 |
| 10 | [部署与运维](10-deployment/implementation.md) | 已编写 | 计划中 | 07～09 |

状态只用「计划中、进行中、已实现、已验证」描述功能；文档写完不表示对应功能已实现。已验证必须附日期/版本/命令/结果。阶段 01 的版本、启动与质量验收见其第 8 节；环境盘点保留实施前快照与实施后摘要。

## 决策、维护与记录

- [ADR索引](decisions/README.md)：模块化单体、Prisma7/ESM、工具迁移、安全/数据策略；0003 工具迁移已接受，其余为提议。
- [变更索引](changelog/README.md)：长期实质性变更记录。
- [排错索引](troubleshooting/README.md)：已知静态差异和后续可复用问题。
- 模板：[阶段](templates/stage-template.md)、[ADR](templates/adr-template.md)、[变更](templates/change-template.md)、[排错](templates/troubleshooting-template.md)。
- [完整文档文件清单](manifest.md)与[历史笔记映射](legacy/README.md)。

根[AGENTS.md](../AGENTS.md)只保存核心规则；维护细节以[流程规范](00-overview/documentation-workflow.md)为准。代码改动前先更新原阶段，架构/数据库/API/依赖变化同步更新对应事实源，完成后验收和记变更。

## 下一步

[阶段01](01-initialization/implementation.md) 已完成，[阶段02数据库](02-database/implementation.md) 已按用户授权安装 Prisma 依赖；初始化、建库、迁移和数据库模块仍需在相应授权范围内推进。沿用 pnpm、Prisma7/MySQL8.4 与现有 ESM；产品侧需在相关阶段确认身份复用、注册/重置渠道、客户端token存储、部署与备份目标，见[待确认事项](00-overview/project-overview.md#待确认的产品与运维决策)。
