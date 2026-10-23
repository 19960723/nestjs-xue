# CHG-20261023-002：校准项目现状与整理实施方案

- 日期：2026-10-23（Asia/Shanghai）
- 变更类型：文档
- 文档状态：已更新
- 功能状态：整体进行中；本次无代理代码实现或业务验收

## 背景与范围

用户要求先给整理方案、由用户修改代码，随后授权代理修改文档。当前已有 Prisma/用户 CRUD、Swagger 和未提交修改，部分入口仍描述为业务未实现，目标方案与当前实现混杂。本次只校正文档并补齐原实施步骤，保留已有 Swagger 任务记录及其他修改，不另建重复整理指南。

## 文件与内容

- 根 README、project/README、doc/README、project-overview：统一入口与当前状态，区分已有代码、阶段未完成及历史验收；不再将旧工作区状态当作当前事实。
- architecture、roadmap、documentation-workflow：补当前目录与调用链、五批整理顺序、移动与行为变更边界、状态事实源及历史证据维护规则。
- 02：盘点 CLI/runtime 配置、生成与构建链路、当前模型和两份迁移；旧初始化步骤改为原地核对，目标 Schema 必须经字段映射和增量方案后实施。
- 03/04：补共用 HTTP/Swagger 初始化及配置收拢步骤；保留实际与目标契约差异；取消重复生成用户骨架，明确 OpenAPI class 不过滤运行时字段，分批落实 select、Repository、校验与软删。
- 06/09：角色关联已存在但授权未实现；权限模型不得整体覆盖旧表；HTTP 隔离测试与真实数据库 E2E 分开，暂不运行测试。
- tech-stack、ADR0001/0002/0004：增加本地实现差异，不改变版本基线或提议状态；manifest/changelog 索引同步。

整理期间用户/其他并行工作将 ValidationPipe 移入 configureApp、移除 main 重复注册与临时 console.log，并新增空 configure-swagger.ts。本次按静态检查记录为部分已实现、未复验，不归为代理代码变更，也不宣称完整启动整理完成。

## 验证与限制

在仓库根目录执行以下文档检查，均通过：

- Python 标准库脚本检查当前 20 份变更 Markdown 的 177 个本地链接及锚点，目标均存在；十阶段 implementation.md 均保留 1～10 章节，退出 0。
- `git diff --check -- README.md project/README.md doc`：退出 0，文档差异无空白错误。
- 对照源码、配置、Schema 和迁移文件确认当前事实；文件摘要对比显示盘点后 main.ts、configure-app.ts 存在并行变化，已据最后静态读取更新文档，不将其归为代理改动。

未安装依赖、执行 generate、构建、测试、连接数据库、迁移或部署；没有查询新的官方版本资料，不扩大已有历史验收范围。当前工作区仍有并行代码修改，状态为本次静态检查快照。

## 数据库、兼容与回滚

无运行时、依赖或数据库变化；目标配置键、JSON 地址、用户字段及软删除仍须按对应阶段单独实施。只回退本次文档差异即可撤销方案；保留既有用户代码、Swagger 文档及历史记录，不覆盖其他未提交修改。

关联：[导航](../README.md)、[整理实施顺序](../00-overview/roadmap.md#当前整理实施顺序)、[架构](../00-overview/architecture.md)。

## 目录移动后检查（2026-10-23）

用户要求检查移动后的目录；代理仅检查并同步文档，未修改代码。Node 24.18.0、pnpm 11.13.1，命令工作目录为 project/。

- users 已移动到 modules/users；AppModule 导入和 UsersService 的 generated/prisma 相对层级正确。初期检查 37 个相对导入无缺失；UsersService 与原路径 HEAD 比较（忽略空白及移动引起的层级）业务内容一致。Prisma 仍在 src/prisma，目录批次尚未全部完成。
- 初期 `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`、`pnpm run build` 通过。初轮测试代码类型检查未报错；检查期间 AppController/AppService 及模板单测被删除，随后 `pnpm exec tsc --noEmit --incremental false -p tsconfig.test.json` 退出 2，AppModule 第 4/5 行仍引用已删除文件，报两处 TS2307。历史通过不代表最新快照通过。
- `pnpm exec eslint src/modules/users src/bootstrap/configure-app.ts src/bootstrap/configure-swagger.ts src/main.ts src/config/env.validation.ts src/app.module.ts --max-warnings=0` 退出 0。
- 同范围 Prettier check 退出 1，users.service.ts、configure-swagger.ts、main.ts 需格式化；源码差异检查还报告 main.ts 尾随空白。未自动修复。
- Pipe 与 Swagger 初始化已共用/提取，SWAGGER_ENABLE 已规范化为布尔值且默认关闭，SWAGGER_PATH 已校验非空。main 的文档日志仍无条件输出且读取 swagger.path，自定义路径/关闭 Swagger 时会给出错误地址提示；应按已校验开关和 SWAGGER_PATH 输出。
- 当前模板删除需同步 AppModule 的 import/controllers/providers；若确定取消 GET /api/v1 问候接口，还应修改现有 app.e2e-spec.ts 对 Hello World 的断言，并更新 OpenAPI 当前操作数量。未恢复或删除任何用户文件。

未执行 Jest、HTTP 请求、数据库连接/迁移、generate 或安装。构建只使用本地已有生成客户端，不证明干净检出可生成或数据库可运行；阶段 02～04 与完整目录整理仍未验收。

同轮复核补充：用户随后清理了 AppModule 的 AppController/AppService 导入和注册。最新生产与测试代码 `tsc --noEmit --incremental false` 检查均退出 0，中间 TS2307 已消除；保留上文作为检查过程记录。问候接口 E2E 的 Hello World 断言仍未调整，未来运行会与已取消的路由冲突；本轮未运行 Jest。

清理引用后的再次 `pnpm run build` 退出 0；文档链接/锚点与差异空白检查通过。通过范围仅为静态检查与构建，未验收 HTTP、Swagger 路由或数据库行为。

## 再次检查（2026-10-23）

用户要求重新检查，代理未改应用代码。相同 Node/pnpm 环境，工作目录 project/；以下为本轮结果，先前问题的记录保留为历史。

- 已修正：旧 E2E 问候断言已删除；main 日志的路径键已改为 SWAGGER_PATH。类型检查无遗留 AppController/AppService 引用错误。
- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`、`pnpm exec tsc --noEmit --incremental false -p tsconfig.test.json`、`pnpm run build` 均退出 0。
- 定向 ESLint（范围为 modules/users、bootstrap 两个配置文件、main、env.validation、app.module、test/app.e2e-spec）退出 0。
- 同范围 Prettier check 退出 1：users.service.ts、configure-swagger.ts、main.ts、test/app.e2e-spec.ts 需格式化；main 和 E2E 文件的 diff check 仍有尾随空白。未自动修复。
- 待收尾：main 仍不判断 SWAGGER_ENABLE 就打印文档地址，默认关闭时会出现误导日志；Prisma 仍在 src/prisma，规划中的基础设施目录移动尚未完成。后者为计划待办，不是当前导入/构建错误。

已同步当前架构、路线图及相关阶段的待办状态；未执行 Jest、HTTP、数据库操作、generate 或安装，不宣称运行行为或完整阶段已验证。

## src 目录最小整理方案补充（2026-10-23）

用户希望继续整理 src，沿用用户修改代码、代理维护文档的协作范围。本次补入原 architecture，并同步 roadmap、阶段 02 和导航；未创建第二份整理指南或改变 ADR 状态。

- 静态盘点根目录仅 main.ts/app.module.ts 两个文件；bootstrap/config 各 2 个，modules 10 个，prisma 2 个，generated 9 个，common/infrastructure 暂为空目录。
- 方案保留两个根入口及现有配置工厂，当前仅移动两个 Prisma 源文件到 infrastructure/database，列出 AppModule、UsersService 与生成客户端的准确相对导入；不搬 Schema/迁移或 generated，不新建转发文件和额外分层。
- DTO/实体命名、Repository、连接配置、模块全局作用域的变化继续作为后续独立工作；空目录是否保留由用户在实施时确认，代理未删除目录。
- 本轮发现用户已注释 main 的重复 Swagger 地址日志，同步当前状态，保留上一轮未修正时的历史记录。

本次只静态盘点与文档检查，未修改应用代码、运行构建/测试、generate、安装或数据库操作；此前检查通过不代表新目录方案已实施或已验收。

## 当前目录架构复查（2026-10-23）

用户要求重新检查当前目录；本轮以实际落地的 modules/users 和 database/prisma 为准。后者是数据库专用目录，职责明确，不再将改到 common/prisma 或 infrastructure/database 视作必需整改。此前路径方案保留为历史记录，当前架构/导航/阶段 02/路线图/ADR0001 已同步，代理未移动或修改应用代码。

- AppModule → PrismaModule 的导入为 ./database/prisma/prisma.module.js；UsersService → PrismaService 为 ../../database/prisma/prisma.service.js；PrismaService → 生成客户端为 ../../generated/prisma/client.js，均正确。旧 src/prisma 不存在。
- 源码/测试共检查 31 个相对导入，无缺失；本地相对导入图未发现循环，不含生成代码与第三方包，不扩大为所有运行时依赖已验证。
- Node/pnpm 沿用当前固定环境；在 project/ 执行 `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`、`pnpm exec tsc --noEmit --incremental false -p tsconfig.test.json`、`pnpm run build`、`pnpm exec eslint src test --max-warnings=0`，均退出 0。
- `pnpm run format:check` 退出 1：bootstrap/configure-swagger.ts、database/prisma/prisma.module.ts、database/prisma/prisma.service.ts、main.ts、modules/users/users.service.ts、test/app.e2e-spec.ts 六个文件未通过。未自动修复。
- common/shared 当前均为空，无重复代码；建议后续只使用一套公共分类，空目录按需由用户清理。本轮保留目录，不新增公共模块或拆分启动工厂。
- 当前 PrismaModule 为 @Global、UsersService 直连 PrismaService，仍是既有实现；显式依赖、Repository、CLI/runtime 连接配置与业务行为按原阶段单独收拢，不归为路径错误。

本次未执行 Jest、HTTP、数据库连接/迁移、generate、安装或部署；当前已有生成客户端下的构建通过不等于干净检出与数据库行为验收通过。文档链接、章节结构和差异空白检查作为文档验收，不据此升级完整业务阶段状态。

## bootstrap 职责整理方案（2026-10-23）

用户询问 bootstrap 是否可优化，按既有协作范围只做源码检查与文档方案；本轮未改应用代码。原阶段 03 新增第 5.6 节，并同步架构与路线图：保留两个初始化文件，配置转换/默认值仍由 env.validation 负责，Swagger 关闭时提前返回，注册后返回文档路径供 main 在 listen 成功后统一输出实际地址，移除 helper 内硬编码 localhost 的提前成功日志。保持现有路由、配置键和启动工厂位置，不增加 Nest Module、额外框架或依赖。

功能状态为计划中，既有 bootstrap 接线不变。本轮仅做文档链接/锚点、十章节结构和差异检查；未运行构建、测试、HTTP、数据库、generate 或安装，先前验收不作为本方案已实施的证据。
