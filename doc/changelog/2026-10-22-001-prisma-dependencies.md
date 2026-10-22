# CHG-20261022-001：安装 Prisma 7.10.1 依赖

- 日期：2026-10-22（Asia/Shanghai）
- 变更类型：新增 / 修复
- 文档状态：已更新
- 功能状态：依赖安装已验证（本地）；阶段 02 进行中，数据库集成未验收

## 背景与范围

用户明确要求代理执行 `pnpm add -DE prisma@7.10.1` 与 `pnpm add --save-exact @prisma/client@7.10.1 @prisma/adapter-mariadb@7.10.1`。保留已有未提交修改，仅安装指定依赖与处理相关脚本审批；不初始化 Schema、不生成客户端、不连接数据库、不迁移或部署。

## 文件、原因与兼容性

- project/package.json、pnpm-lock.yaml：CLI 为开发依赖，Client/adapter 为生产依赖，全部精确 7.10.1。沿用现有 ESM/MySQL 方案，版本和 Node/TS 条件见[技术栈](../00-overview/tech-stack.md#prisma-7-专用约束)。
- project/pnpm-workspace.yaml：将 prisma、@prisma/engines 的待审批占位改为 true；@scarf/scarf 安装统计设 false，保留 watcher/resolver 禁止脚本策略。
- 更新原阶段 02、技术栈、导航/路线图、ADR0002 的安装事实、排错和本记录；不将依赖安装扩大为架构决策整体接受或数据库集成已验证。

## 验证记录

环境：Darwin arm64，Node24.18.0、pnpm11.13.1、TypeScript6.0.3；安装目录 project/。

- npm 官方元数据与安装包声明：三个版本无预发布后缀；CLI/Client 的 Node/TS 要求满足；adapter 未声明 engines/peers。better-sqlite3 是可选 peer，不额外引入数据库驱动。
- 首次沙箱请求/安装受网络及原缓存权限限制，获准后复用原 store；未删除 node_modules 或修改全局配置。
- CLI 添加命令退出 0；Client/adapter 首次添加已落盘，但因未审批 @scarf/scarf 返回 1，按上述策略处理后继续验收。
- 最终 `pnpm install --frozen-lockfile` 退出 0，无锁文件改写；`pnpm rebuild @prisma/engines prisma` 退出 0，两个脚本均显示 Done；`pnpm peers check` 退出 0，无 peer 问题；`pnpm why @scarf/scarf` 确认链路为 @nestjs/swagger → swagger-ui-dist → @scarf/scarf。保留用户并行改动，未将该链路归为本次主动新增的直接依赖。
- 在临时目录仅链接现有 node_modules 并提供最小 package.json，直接运行已安装 CLI `--version`，退出 0：CLI/Client 均为 7.10.1，Darwin arm64 schema engine 可用。此方式避开项目个人 .env 与用户新增的 Prisma 配置；最初在纯 /private/tmp 查询显示 Client Not found，补齐隔离目录的依赖解析后确认安装正常。
- project/ 中 `pnpm run build` 退出 0；Node ESM 动态导入 PrismaMariaDb 成功，断言 package.json 与三个已安装包均精确 7.10.1。未实例化数据库客户端。
- 文档和依赖文件的 `git diff --check` 退出 0。全工作区检查发现已有 project/src/main.ts:13 尾随空格，未触碰用户代码。
- 仍有 glob@10.5.0 间接依赖弃用警告，不影响上述成功结果；本次不扩展依赖升级。未运行 validate/generate/migrate 或数据库测试，构建通过不代表数据库可用。

## 数据库影响与回滚

无数据库操作。按本次差异回退三个直接依赖、匹配锁文件及新增脚本策略，再使用匹配 pnpm 安装；不得覆盖用户其余未提交改动、删除数据或重写已应用迁移。

关联：[阶段02](../02-database/implementation.md)、[排错](../troubleshooting/initial-findings.md#prisma-依赖安装排错2026-10-22)。
