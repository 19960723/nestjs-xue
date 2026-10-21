# 初始化检查中的静态差异

编号：TS-001。日期：2026-10-21。状态：已定位静态差异；运行复现/修复待后续实施。本次没有修正业务代码。

## 现象、证据与处理

| 问题 | 静态证据 | 处理与后续验证 |
| --- | --- | --- |
| 日志地址有/api，实际未设前缀 | main日志含/api，但未调用setGlobalPrefix，Controller路径为空 | 01明确设置/api+URI v1，用curl验证health；不只改日志 |
| Hello World测试可能失败 | app.service返回带尾随空格，spec/e2e期望无空格 | 01按预期修正返回或测试，Jest实际运行后记结果；当前不能称已复现失败 |
| Prisma旧笔记示例混用 | 旧档案含prisma-client-js/schema URL/无adapter示例 | 02统一7.10.1、prisma7.config.ts、MySQL adapter与生成路径；generate/build/真库验收 |
| Observe取不到.env凭据 | AppModule求值时读取process.env，ConfigModule.forRoot在后 | 01先加载环境再初始化，默认可关闭；分别测开/关/缺凭据 |
| 两套锁文件不一致 | npm锁仍为旧根依赖，pnpm锁含config/dotenv | 01审阅后统一pnpm，不用删node_modules/强制安装当第一步 |
| Docker socket权限拒绝 | 沙箱内info失败，获准只读查询返回29.6.1 | 是权限边界，不据此断言Docker服务没启动；本次引擎已只读验证 |
| MySQL/Redis CLI未找到 | PATH中无mysql/redis-cli | 不等于服务未安装/未运行；确认容器/远程地址和版本，不自动安装或重置 |

## 复现与结果记录

目前仅版本信息与文件检查结果可复核，记录见 [环境盘点](../00-overview/environment-audit.md)。后续实际修复时，在原阶段/changelog补环境、命令、期望、实际与回归范围；真实Secrets、token、数据库连接串一律脱敏。

## 回滚与预防

本次只新增/整理文档，代码没有变更可回滚。未来修改应局部进行，保留用户未提交改动；Prisma示例统一引用技术栈和02，不再复制多份互不兼容实现；工具迁移使用 [ADR0003](../decisions/0003-tooling-alignment.md)。
