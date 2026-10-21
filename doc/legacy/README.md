# 历史学习笔记归档

归档日期：2026-10-21。本目录不是当前实施入口。保留原笔记内容（增加历史提示并调整归档内链接），供追溯；其中状态、五阶段顺序与Prisma/安全/测试示例可能已过时。

| 原位置 | 归档文件 | 当前权威入口 |
| --- | --- | --- |
| 根README.md | [project-guide.md](project-guide.md) | [项目总览](../00-overview/project-overview.md) |
| doc/README.md | [document-index.md](document-index.md) | [文档导航](../README.md) |
| doc/01-基础架构.md | [foundation.md](foundation.md) | 阶段[01](../01-initialization/implementation.md)/[02](../02-database/implementation.md)/[03](../03-api-standards/implementation.md) |
| doc/02-用户CRUD.md | [users-crud.md](users-crud.md) | 阶段[04](../04-user-management/implementation.md) |
| doc/03-接口规范.md | [api-standards.md](api-standards.md) | 阶段[03](../03-api-standards/implementation.md) |
| doc/04-认证权限.md | [authentication-authorization.md](authentication-authorization.md) | 阶段[05](../05-authentication/implementation.md)/[06](../06-authorization/implementation.md) |
| doc/05-进阶工程化.md | [engineering.md](engineering.md) | 阶段[07](../07-redis/implementation.md)～[10](../10-deployment/implementation.md) |

旧笔记里直接存password、无adapter Prisma客户端、角色enum、只让前端丢token退出等示例不能按当前生产方案执行。请使用新阶段的字段、认证/授权和验收标准；不要在此继续维护第二套实施方案。
