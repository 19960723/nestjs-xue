# NestJS 后端项目

采用文档驱动开发，由用户按阶段实施。应用代码在 `project/`，全部技术文档在 [`doc/`](doc/README.md)。阶段 01 初始化已完成本地验收，后续业务按阶段推进。

- [文档导航与真实进度](doc/README.md)
- [总体架构](doc/00-overview/architecture.md) · [版本与兼容](doc/00-overview/tech-stack.md) · [环境盘点](doc/00-overview/environment-audit.md)
- [开发路线图](doc/00-overview/roadmap.md) · [阶段01具体任务](doc/01-initialization/implementation.md)
- [长期协作规则](AGENTS.md) · [变更记录](doc/changelog/README.md)

当前使用 NestJS12/ESM、ConfigModule、Jest/ESLint/Prettier；阶段 01 已留存本地验收记录。已有 Prisma 集成、迁移文件、用户基础 CRUD 和 Swagger 装饰器，阶段 02～04 仍进行中，数据库业务未验收；认证与 RBAC 尚未实现，完整测试与 CI 留在阶段 09。真实进度以[文档导航](doc/README.md)及各阶段验收记录为准。

当前先按[整理实施顺序](doc/00-overview/roadmap.md#当前整理实施顺序)校正文档、收拢启动配置并统一目录，再补齐数据库与用户行为；代码默认由用户修改，或按明确授权由代理实施。

建议主线：01初始化 → 02数据库 → 03接口规范 → 04用户 → 05认证 → 06权限 → 07Redis → 08公共能力 → 09测试/CI → 10部署。测试与文档维护贯穿每阶段。

旧五阶段学习笔记及原长篇README已移到 [历史归档](doc/legacy/README.md)，保留追溯用途，实施以当前导航为准。
