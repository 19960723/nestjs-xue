# 架构决策记录

以下均为本次规划提出的建议，尚未实施，不能把文档初始化理解为已经迁移代码。用户在实施阶段接受方案后更新状态和确认记录；后续替代决定保留历史。

| 编号 | 决策 | 状态 | 主要影响 |
| --- | --- | --- | --- |
| [0001](0001-modular-monolith.md) | 模块化单体与边界 | 提议 | 模块/目录/依赖 |
| [0002](0002-prisma7-esm.md) | Prisma7 + MySQL + ESM | 提议 | ORM/生成器/迁移/运行 |
| [0003](0003-tooling-alignment.md) | pnpm/Jest/ESLint对齐 | 提议 | 现有Vitest/Oxlint/双锁文件 |
| [0004](0004-security-and-data-policy.md) | 身份/软删/会话/权限策略 | 提议 | API/数据/安全/客户端 |

新记录复制 [ADR模板](../templates/adr-template.md)，编号递增；更新 [技术栈](../00-overview/tech-stack.md)、[架构](../00-overview/architecture.md)、所属阶段和变更记录。
