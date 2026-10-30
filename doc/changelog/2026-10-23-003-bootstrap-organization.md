# CHG-20261023-003：收拢 bootstrap 配置读取与启动日志

- 日期：2026-10-23（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：本项已实现；类型/构建/静态质量已验证，运行验收暂缓；阶段 03/09 未整体完成

## 背景与范围

用户明确要求代理按阶段 03 第 5.6 节实施。变更前 Swagger helper 再次提供开关、路径和端口默认值，并在监听成功前用硬编码 localhost 输出文档地址；main 留有重复日志注释和多余空行。本次保留两个 bootstrap 文件，只收拢读取与日志职责，不扩大到数据库、业务、依赖或测试体系。

## 文件与最终行为

- project/src/bootstrap/configure-app.ts：整理职责注释，保留前缀 api、URI v1 和 ValidationPipe 全部规则，main/E2E 继续调用同一函数。
- project/src/bootstrap/configure-swagger.ts：从 ConfigService 通过 getOrThrow 和 Environment 类型推断读取已校验开关/路径。关闭时返回 undefined；开启时沿用现有 DocumentBuilder、Bearer 定义、注册路径及 persistAuthorization，返回 SwaggerRegistration.uiPath。只规范化显示路径的前导斜杠，实际注册使用原配置路径。去掉内部成功日志及重复默认值，将 documentConfig 改为 camelCase。
- project/src/main.ts：保存 Swagger 注册信息，保留 configureApp → configureSwagger → shutdown hooks → listen 顺序。listen 成功后获取一次 app.getUrl()，输出服务地址；仅已注册 Swagger 时拼接 uiPath 输出文档地址，清理原注释和空行。
- 更新原阶段 03、架构、路线图、导航与索引；原整理方案和历史验收记录保留，不改写为本次运行结果。

## 兼容性与边界

保留 SWAGGER_ENABLE、SWAGGER_PATH 及 env.validation 中的默认值，默认 Swagger 关闭；默认 UI 为 /api/docs，JSON 为 /api/docs-json。HTTP /api/v1、DTO、模块依赖、启动工厂及数据库代码不变，无新增依赖。configureSwagger 内部返回类型从 void 改为 SwaggerRegistration | undefined，当前仅 main 调用并消费结果。

## 验证记录

基于提交 5dd53a7；Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3；工作目录 project/。

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`：退出 0。
- `pnpm exec tsc --noEmit --incremental false -p tsconfig.test.json`：退出 0，仅静态类型检查，未执行测试。
- `pnpm run build`：退出 0，使用已有本地生成客户端。
- `pnpm run lint`：退出 0，src/test 全仓 ESLint，无 warning。
- `pnpm exec prettier --write src/bootstrap/configure-app.ts src/bootstrap/configure-swagger.ts src/main.ts`：退出 0，仅格式化本次三个文件。
- 同范围 `pnpm exec prettier --check ...`：退出 0；不将此结果扩大为既有未修改文件的全仓格式通过。
- 收尾检查：8 份变更文档的 129 个本地链接/锚点、十阶段 1～10 章节结构均通过，检查脚本退出 0；仓库根目录 `git diff --check` 退出 0。

按现有“暂不运行测试”的约定，未执行 Jest、HTTP、Swagger 开关或 UI 验收；未监听应用端口、加载个人配置、连接数据库、generate、安装、迁移或部署。监听失败不输出成功日志、关闭不注册文档等运行断言待恢复验证后执行，不能仅凭编译通过标业务已验证。

## 数据库影响与回滚

无 Schema、迁移或数据影响。需要回退时撤销本次两个 bootstrap 文件、main 及匹配文档的差异；同时还原 helper 返回值和入口消费方式，保留用户其他提交与修改。

关联：[阶段 03 第 5.6 节](../03-api-standards/implementation.md#56-bootstrap-职责与启动日志整理)、[架构](../00-overview/architecture.md#启动边界与待收拢项)、[路线图](../00-overview/roadmap.md#当前整理实施顺序)。

## 进度复核（2026-10-24）

用户要求检查当前进度。本轮源码仍为上次 bootstrap 修改及此前提交，HEAD 为 5dd53a7，未提交改动保留；没有新增应用代码变更。已将进度摘要补充到原项目总览和导航，不改变原阶段验收门槛。

Darwin arm64、Node 24.18.0、pnpm 11.13.1，工作目录 project/，以下命令重新执行：

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`：退出 0。
- `pnpm exec tsc --noEmit --incremental false -p tsconfig.test.json`：退出 0，仅测试代码类型检查。
- `pnpm run build`：退出 0。
- `pnpm run lint`：退出 0。
- `pnpm run format:check`：退出 1；PrismaModule、PrismaService、UsersService、app.e2e-spec 四个既有文件未通过，未自动修复。
- 仓库根目录 `git diff --check`：退出 0。

本轮未执行 Jest、HTTP、数据库操作、generate、安装或部署。阶段 01 保留历史验收，02～04 仍进行中，其余阶段的完整能力仍计划中；没有将本轮编译/静态检查扩大为业务或部署验收。
