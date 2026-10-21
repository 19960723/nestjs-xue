# CHG-20261021-001：文档体系与开发规划初始化

- 日期：2026-10-21（Asia/Shanghai）
- 变更类型：新增 / 修改
- 文档状态：已编写，静态检查已通过；示例运行仍待各阶段验收
- 功能状态：整体进行中；本次无业务实现

## 背景与原因

用户要求按文档亲自搭建可维护NestJS项目，首次仅做规划。仓库已有Nest12/ESM骨架、Vitest/Oxlint和五阶段笔记，需要保留现状并建立统一十阶段路线与长期协作规则，消除Prisma版本和进度表述不一致。

## 涉及模块与文件

仅根AGENTS/README和doc文档。完整路径清单见 [manifest](../manifest.md)，历史资料映射见 [legacy导航](../legacy/README.md)。project/含用户改动，本次没有修改/新增其中代码、配置或锁文件。

## 具体变更

新增总览/架构/技术栈/环境记录/路线图/维护规范；十阶段实施指南；四份提议ADR；四个模板；变更/排错入口。根README改为导航，原根长篇指南、doc导航与五篇笔记归档为英文文件名并加历史提示，目录内链接按归档位置调整。

核实本地Node24.18.0、pnpm11.13.1、Docker29.6.1/Compose5.3.0及已装依赖。只读查询npm官方元数据与官方资料确认Prisma7.10.1版本线、MySQL8.4 LTS、Jest/ESLint/TS6声明兼容范围。MySQL/Redis服务与运行兼容待确认。

## 兼容性影响

没有运行时/API/依赖行为改变。当前工具仍为Vitest/Oxlint，迁移只写入后续方案。旧笔记路径移入doc/legacy，原内部链接已调整，外部旧书签可能失效；新导航为权威入口。ADR状态为提议，不伪称用户已确认。

## 数据库影响

无。没有连接数据库、建库、迁移、DDL/DML、重置或容器启动。Schema与命令只是阶段文档示例，后续必须按前置条件和授权实施。

## 验证方式与结果

- 已执行只读环境/包元数据检查，结果见environment-audit。
- 文档静态检查：41个Markdown文件、210个本地链接（含锚点）、10份阶段指南的十章节/功能表字段、英文文件名、清单完整性、代码围栏和3段JSON示例检查通过。历史内容的JSON示例未作为当前规范校验。
- project/非构建文件前后SHA-256基线比较：22个文件全部一致，无新增/删除/修改；包括.env完整性比较，仅计算摘要，没有输出内容。已有用户Git改动完整保留。
- 应用启动、构建、lint、测试、数据库/Redis集成和Docker构建：未执行，不在此次文档任务范围内。

## 关联文档

[导航](../README.md)、[路线图](../00-overview/roadmap.md)、[技术栈](../00-overview/tech-stack.md)、[维护规范](../00-overview/documentation-workflow.md)、[ADR](../decisions/README.md)、[静态排错](../troubleshooting/initial-findings.md)。
