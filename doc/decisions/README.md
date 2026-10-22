# 架构决策记录

0003 已随阶段 01 授权实施并接受；其余仍为规划提议。各决策确认记录独立维护，后续替代决定保留历史。

| 编号 | 决策 | 状态 | 主要影响 |
| --- | --- | --- | --- |
| [0001](0001-modular-monolith.md) | 模块化单体与边界 | 提议 | 模块/目录/依赖 |
| [0002](0002-prisma7-esm.md) | Prisma7 + MySQL + ESM | 提议 | ORM/生成器/迁移/运行 |
| [0003](0003-tooling-alignment.md) | pnpm/Jest/ESLint对齐 | 已接受 | 现有Vitest/Oxlint/双锁文件 |
| [0004](0004-security-and-data-policy.md) | 身份/软删/会话/权限策略 | 提议 | API/数据/安全/客户端 |

新记录复制 [ADR模板](../templates/adr-template.md)，编号递增；更新 [技术栈](../00-overview/tech-stack.md)、[架构](../00-overview/architecture.md)、所属阶段和变更记录。
