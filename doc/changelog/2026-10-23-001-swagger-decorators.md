# CHG-20261023-001：补齐现有模块 Swagger 装饰器

- 日期：2026-10-23（Asia/Shanghai）
- 文档状态：已更新
- 功能状态：本次 Swagger 装饰器已验证（本地）；阶段 03/04 仍进行中，阶段 09 未整体完成

## 背景与范围

用户明确要求为现有模块添加 Swagger 装饰器。对实际代码盘点后，覆盖 App、Health、Users 三个 HTTP 控制器的全部 7 个操作，保留用户已有的 nest-cli.json Swagger 插件及 PrismaService 日志修改。未安装依赖、修改启动配置、生成客户端或执行数据库操作。

## 文件与行为

- `project/src/app.controller.ts`、`modules/health/health.controller.ts`：增加分组、接口摘要和实际响应 schema；问候为 text/plain，存活响应为原始 `{status:"ok"}`。
- `project/src/users/users.controller.ts`：增加 users 分组、CRUD 摘要、ID 参数、请求体、200/201 成功响应及已实现的 400/404/409 说明。不添加未实现的认证要求。
- `project/src/users/dto/create-user.dto.ts`、`query-user.dto.ts`：增加字段描述、示例、可选性、边界和分页默认值；原 UpdateUserDto 继续用 Swagger PartialType 继承。
- `project/src/users/entities/user.entity.ts`、`dto/user-response.dto.ts`：显式描述实际用户标量、可空字段、日期、分页及删除消息。仅用于 OpenAPI，不改变运行时数据或校验规则。
- `project/src/bootstrap/swagger.spec.ts`：曾新增隔离 OpenAPI 契约测试；同日按用户“暂时不走测试”的要求删除，保留全部 Swagger 装饰器和响应模型。
- 阶段 02 补充当前静态盘点，原阶段 03/04、导航、路线图、清单与变更索引：区分现有接口事实和后续统一包装、软删、认证等目标。

## 验证与限制

以下执行结果为删除测试文件前的历史记录。删除后仅核对文件已移除及差异格式，未重新运行测试；31 项不是当前测试数量。

Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3、@nestjs/swagger 12.0.2；工作目录 `project/`。

- `pnpm run build`、`pnpm run typecheck`、`pnpm run test --runInBand`：退出 0；4 个套件 31 项测试通过，新增 4 项 OpenAPI 契约测试。
- 本次变更的 8 个 TS 文件：定向 ESLint（`--max-warnings=0`）及 Prettier 检查通过；`git diff --check` 通过。未宣称已有未修改文件的全仓 lint/格式通过。
- 构建后 dist 模块通过隔离 OpenAPI 生成冒烟断言，覆盖 CLI 插件路径；tsc/Jest 路径的装饰器独立生效也已验证。
- 首次测试命令多传 `--` 导致 Jest 未发现匹配测试，纠正参数后通过。Jest VM modules 仍有既有实验性提示。
- 未执行真实 UI 浏览器验收、数据库 CRUD/E2E、CI 或部署；不据此宣称数据库业务和整个阶段已验证。

## 数据库影响与回滚

无 Schema、迁移和数据影响。需要回退时仅撤销本次控制器/DTO 的装饰器、新增响应模型及相应文档；保留用户已有插件配置和 PrismaService 修改。

关联：[阶段 03](../03-api-standards/implementation.md)、[阶段 04](../04-user-management/implementation.md)。
