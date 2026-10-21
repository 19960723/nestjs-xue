# ADR 0001：采用模块化单体与具体Repository

- 日期：2026-10-21
- 状态：提议
- 确认记录：待实施时确认；当前仅规划
- 关联：[架构](../00-overview/architecture.md)、[路线图](../00-overview/roadmap.md)

## 背景与约束

现有代码是Nest单个应用，目标是长期扩展且由用户逐阶段实现。首批功能用户/认证/权限共用数据，尚无独立扩缩容或团队分拆需求。

## 候选方案

| 方案 | 好处 | 成本 |
| --- | --- | --- |
| 模块化单体 | 原生DI、短事务、单部署、易调试 | 需要明确模块边界 |
| 初始微服务 | 可独立部署 | 网络/分布式事务/运维成本超出需求 |
| 通用多层DDD模板 | 结构统一 | 当前用例简单，接口/基类过多 |

## 决定与理由

一个Nest应用，按Users/Auth/Authorization/Health等模块组织；Controller管HTTP，Service管业务与事务，具体Repository管Prisma查询和安全select。没有查询的模块不强行造Repository，不造BaseRepository或通用工作单元。Common只保留跨业务的HTTP与上下文能力，基础设施单独模块。

## 影响与迁移

新增模块按阶段生成，不移动/重构当前用户修改。跨模块通过导出Service和明确的tx协作接口，禁止循环import。MySQL单事务保留一致性；Redis可选展示缓存。未来如需拆服务，先有明确容量/发布/隔离需求及新ADR。

## 验证与重新评估

检查Module imports/exports、Repository是否被跨模块直接写入、Service单测能否用DI fake隔离。当前未实施，不能标已验证。
