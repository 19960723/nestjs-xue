> 历史归档（2026-10-21），原位置：`doc/README.md`。以下保留旧方案用于追溯，其中版本、阶段、状态与代码示例可能过时；当前实施请从 [文档导航](../README.md) 开始。

# 学习文档目录

本目录是实现步骤的详细笔记，给复习用。项目总览仍看仓库根目录的 `README.md`。

所有命令都在 `project/` 下执行。本项目是 **NestJS 12 + ESM**：本地 `import` 必须带 `.js` 后缀，即使源文件是 `.ts`。

## 阅读顺序

| 文档 | 内容 | 当前状态 |
| --- | --- | --- |
| [01-基础架构.md](foundation.md) | 目录结构、环境变量、Prisma、迁移、全局前缀、Swagger | 初始化与 `.env` 已完成，其余待做 |
| [02-用户CRUD.md](users-crud.md) | Module / Controller / Service、用户增删改查、分页搜索 | 待做 |
| [03-接口规范.md](api-standards.md) | DTO 校验、统一响应、异常过滤、日志、状态码 | 待做 |
| [04-认证权限.md](authentication-authorization.md) | 注册登录、Argon2、JWT、Guard、RBAC | 待做 |
| [05-进阶工程化.md](engineering.md) | Redis、上传、事务、软删除、限流、测试、Docker | 待做 |

## 怎么用这份文档

1. 先读该阶段开头的「要搞懂什么」，再动手。
2. 每一步都有：目的、命令、完整代码、为什么、怎么验收、常见错误。
3. 做完一个步骤再进下一步，不要跳着抄。
4. 复习时重点看「为什么」和「请求怎么走」，不要只背代码。

## 目标目录

```text
project/
├── prisma/schema.prisma
├── src/
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   └── interceptors/
│   ├── prisma/
│   ├── users/
│   ├── auth/
│   ├── app.module.ts
│   └── main.ts
├── .env
└── doc/          ← 你正在看的学习文档
```
