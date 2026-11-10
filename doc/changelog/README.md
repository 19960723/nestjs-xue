# 长期变更记录

| 日期 | 编号 | 类型 | 内容 |
| --- | --- | --- | --- |
| 2026-11-10 | [CHG-20261110-005](2026-11-10-005-session-revoke.md) | 新增 | 当前退出、全部退出和修改密码；用户增加 tokenVersion 并本地 HTTP 验收 |
| 2026-11-10 | [CHG-20261110-004](2026-11-10-004-refresh-rotation.md) | 新增 | Refresh 单次轮换和重放撤销；新增会话摘要表并本地 HTTP 验收 |
| 2026-11-10 | [CHG-20261110-003](2026-11-10-003-access-guard-http.md) | 核对 | 本地 HTTP 验收登录、Guard 和当前用户；临时账号已删除 |
| 2026-11-10 | [CHG-20261110-002](2026-11-10-002-access-guard.md) | 新增 | 注册全局 Access Guard，公开健康检查和登录，增加 GET /auth/me |
| 2026-11-10 | [CHG-20261110-001](2026-11-10-001-module-comments.md) | 修改 | 为认证、用户、角色和公共管线补充中文职责注释；不改变行为 |
| 2026-11-09 | [CHG-20261109-001](2026-11-09-001-username-login.md) | 新增 | 用户名密码登录，写入已有会话并签发 Access JWT；无刷新和 Guard |
| 2026-11-02 | [CHG-20261102-002](2026-11-02-002-initial-password.md) | 新增 | 密码为空的启用用户可首次设密，存 Argon2id；无登录 |
| 2026-11-02 | [CHG-20261102-001](2026-11-02-001-migration-alignment.md) | 核对 | 本地三份迁移已应用且与 Schema 一致；空增量已删除；name 为删列 |
| 2026-10-31 | [CHG-20261031-008](2026-10-31-008-user-response-last-login.md) | 修改 | 用户公开响应增加 lastLoginAt |
| 2026-10-31 | [CHG-20261031-007](2026-10-31-007-create-user-dto.md) | 修改 | 用户创建/更新改为资料字段，不接收密码 |
| 2026-10-31 | [CHG-20261031-006](2026-10-31-006-user-session.md) | 新增 | Schema 增加 sys_user_session；未改业务模块，未创建迁移 |
| 2026-10-31 | [CHG-20261031-005](2026-10-31-005-role-permission.md) | 新增 | Schema 增加 RolePermission，连通用户、角色与权限 |
| 2026-10-31 | [CHG-20261031-004](2026-10-31-004-permission-type.md) | 修改 | Permission.type 改为 M/C/A/API 枚举 |
| 2026-10-31 | [CHG-20261031-003](2026-10-31-003-permission-model.md) | 新增 | Schema 增加 Permission 树形权限表；未创建迁移，授权未实现 |
| 2026-10-31 | [CHG-20261031-002](2026-10-31-002-user-model-fields.md) | 修改 | User 增加 username/password/avatar/lastLoginAt/deletedAt，name 改为 nickname；未创建迁移 |
| 2026-10-31 | [CHG-20261031-001](2026-10-31-001-database-url.md) | 修改 | CLI 与运行时统一 DATABASE_URL 校验与 adapter 解析；build 串联 generate |
| 2026-10-30 | [CHG-20261030-003](2026-10-30-003-api-envelope.md) | 新增/修改 | 统一成功包装、全局异常与 requestId；删除 data 为 null；HTTP 未验收 |
| 2026-10-30 | [CHG-20261030-002](2026-10-30-002-users-align-roles.md) | 修改 | 用户 CRUD 对齐角色写法：公开 select、显式写入、ParseIntPipe、删除前检查角色分配 |
| 2026-10-30 | [CHG-20261030-001](2026-10-30-001-role-resource-crud.md) | 修改 | 补齐角色列表/详情/更新/删除，接入查询 DTO 与删除前分配检查；类型/构建通过，数据库行为未验收 |
| 2026-10-26 | [CHG-20261026-002](2026-10-26-002-role-create.md) | 修改 | 实现角色创建、字段白名单及编码冲突 409；重新生成本地 Prisma Client，类型/构建通过，数据库行为未验收 |
| 2026-10-26 | [CHG-20261026-001](2026-10-26-001-role-dto-validation.md) | 修改 | 完善角色创建/更新/查询 DTO 的字段校验、空值规则和 Swagger；类型/构建及目标文件静态检查通过 |
| 2026-10-23 | [CHG-20261023-003](2026-10-23-003-bootstrap-organization.md) | 修改 | bootstrap 复用已校验配置、返回 Swagger 注册路径，并在监听成功后统一日志；类型/构建/静态质量检查通过 |
| 2026-10-23 | [CHG-20261023-002](2026-10-23-002-project-organization.md) | 文档 | 校准当前实现与历史验收，明确五批整理顺序、目录边界和模型差异；代码由用户修改 |
| 2026-10-23 | [CHG-20261023-001](2026-10-23-001-swagger-decorators.md) | 新增/修改 | 为现有 App、Health、Users 接口补齐 Swagger 装饰器、响应模型与契约验证 |
| 2026-10-22 | [CHG-20261022-001](2026-10-22-001-prisma-dependencies.md) | 新增/修复 | 安装 Prisma CLI/Client/MySQL adapter 7.10.1，处理 pnpm 安装脚本审批 |
| 2026-10-21 | [CHG-20261021-002](2026-10-21-002-initialization.md) | 新增/修改/修复 | 阶段01实施：pnpm、配置校验、Jest/ESLint、健康接口及本地验收 |
| 2026-10-21 | [CHG-20261021-001](2026-10-21-001-documentation-initialization.md) | 新增/修改 | 文档体系、十阶段指南、环境核实、协作规则与历史归档 |

后续复制 [变更模板](../templates/change-template.md)，实质性变更记录背景、文件、原因、兼容性、数据库影响、验证方式/结果和关联文档。格式微调可合并，不用每次另开编号。文档与功能状态分别维护。
