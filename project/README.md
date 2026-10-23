# 应用目录

应用源码、依赖与配置位于本目录，技术文档统一在根目录 `doc/`。

- [文档导航](../doc/README.md)
- [阶段 01：环境、启动与质量检查](../doc/01-initialization/implementation.md)
- [技术栈与兼容基线](../doc/00-overview/tech-stack.md)
- [测试方案](../doc/09-testing/implementation.md)
- [长期变更记录](../doc/changelog/README.md)

阶段 01 已留存本地验收记录；当前已有 Prisma 集成、迁移文件、用户基础 CRUD 与 Swagger 装饰器，数据库业务仍未验收。真实进度以[文档导航](../doc/README.md)为准，后续修改按[整理实施顺序](../doc/00-overview/roadmap.md#当前整理实施顺序)分批执行。项目基于 [NestJS](https://nestjs.com/)，使用 pnpm 管理依赖。
