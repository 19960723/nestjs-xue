# CHG-20261118-005：阶段 02 隔离库验收

- 日期：2026-11-18（Asia/Shanghai）
- 变更类型：核对
- 文档状态：已更新
- 功能状态：进行中。隔离空库、唯一约束、回滚和关闭钩子已通过；专用账户、UTC、持久 shadow 和生产 TLS 未满足

## 背景与原因

阶段 02 还剩隔离空库 deploy、唯一约束、事务回滚、连接失败和关闭没有执行。这次只在新建的本地空库上核对，不改开发库和已有迁移。

## 涉及模块与文件

- `doc/02-database/implementation.md`
- `doc/README.md`
- `doc/00-overview/roadmap.md`
- `doc/00-overview/project-overview.md`
- `doc/00-overview/tech-stack.md`

没有改应用代码、Schema 或迁移 SQL。验收脚本用完已删除。

## 具体变更

阶段 02 勾上隔离空库 deploy，以及唯一约束、事务回滚、连接失败和关闭。阶段状态仍是进行中：本地账户可以建表和删表，会话时区是 CST，shadow 地址没有保存，生产 TLS 没有启用。

## 兼容性影响

没有 API、配置或依赖变化。

## 数据库影响

新建 `init_xue_test_mwlm5aco` 和 `init_xue_test_mwlm5acosh`，只在 `127.0.0.1`。空库 deploy 了现有九份迁移。临时 shadow 只用于重放比较，没有写入 `.env`。探针表 `_stage02_ddl_probe` 在隔离库创建后立即删除。测试用户行已删除。没有 reset，没有 drop 数据库，开发库 `nestjs_new_db` 未改。

## 验证方式与结果

环境与 [CHG-20261118-004](2026-11-18-004-database-acceptance.md) 相同。目录 `project/`。

- `prisma migrate deploy --config prisma7.config.ts` 对空库退出 0。
- 空库相对 Schema 的 `migrate diff --exit-code` 退出 0。
- 临时 shadow 重放迁移后再与 Schema 比较，退出 0。
- 十张表存在。用户名、邮箱、手机号唯一；`status` 默认 1，`token_version` 默认 0，`roles.is_system` 默认 0。
- 重复邮箱和重复用户名返回 1062。事务回滚后计数为 0。
- 连接 `127.0.0.1:1` 得到 `ECONNREFUSED`。驱动 `end()` 后查询失败。
- `app.close()` 后日志出现「Prisma 数据库连接已断开」。
- Windows 外部 SIGINT、SIGTERM 使 `node dist/main.js` 退出码为 1，没有断开日志。
- 同一账户可以在隔离库执行 DDL。时区为 `SYSTEM` / `CST`，相对 UTC 偏移 480 分钟。
- 事后开发库 `migrate status` 仍是九份迁移且已是最新。

## 关联文档

- [阶段 02 第 8 节](../02-database/implementation.md)
