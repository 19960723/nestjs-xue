# ADR 0001：采用模块化单体与具体Repository

- 日期：2026-10-21
- 状态：提议
- 确认记录：完整边界方案仍待确认；2026-10-23 已有 Users/Prisma 模块及整理文档，目录、显式依赖与 Repository 尚未整体落实，不据此将本 ADR 标为已接受
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

新增模块按阶段生成；当前已存在的 Users/Prisma 按[整理边界](../00-overview/architecture.md#目录整理边界待用户实施)原地移动和修正导入，不重复生成、不覆盖用户修改。目录移动不夹带业务变化。跨模块通过导出 Service 和明确的 tx 协作接口，禁止循环 import。MySQL 单事务保留一致性；Redis 可选展示缓存。未来如需拆服务，先有明确容量/发布/隔离需求及新 ADR。

2026-10-23 目录核对补充：当前用户选择 modules/users 与 database/prisma，相关导入已更新并通过类型/构建/ESLint 检查；采用现有数据库专用目录，不把此前 infrastructure/common 的可选布局当作强制要求。common/shared 当前为空，后续公共能力使用单一约定即可。完整业务边界尚未落实，本 ADR 仍为提议。

## 验证与重新评估

检查 Module imports/exports、Repository 是否被跨模块直接写入、Service 单测能否用 DI fake 隔离。当前已有 UsersService 直接使用全局 PrismaService，完整边界未落实，不能标已验证。
