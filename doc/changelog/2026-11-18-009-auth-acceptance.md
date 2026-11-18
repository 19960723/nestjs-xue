# CHG-20261118-009：阶段 05 隔离库核对

- 日期：2026-11-18（Asia/Shanghai）
- 变更类型：核对
- 文档状态：已更新
- 功能状态：已验证（本地）。注册和重置不实现

## 背景与原因

阶段 05 的登录、刷新、退出和改密已经落地。这次用现有隔离库套件再核对一遍，不补密码重置。

## 涉及模块与文件

- `doc/05-authentication/implementation.md`
- `doc/README.md`
- `doc/00-overview/roadmap.md`

没有改应用代码。

## 具体变更

阶段 05 标为已验证（本地）。当前没有注册接口，也没有重置接口。

## 兼容性影响

没有 API、配置或依赖变化。

## 数据库影响

新建 `init_xue_test_mwlzd4jv`，只在 `127.0.0.1`。空库 deploy 了现有九份迁移。没有 reset，没有 drop，开发库未改。

## 验证方式与结果

环境：win32 x64、Node 24.22.2，目录 `project/`。`pnpm run test:integration:auth` 退出 0。2 个套件、19 项通过。

本次覆盖：密码错误和用户不存在同为 401，无令牌 401，Refresh 重放后新 Access 失效，当前退出、全部退出、改密、停用和软删后旧会话失效，Redis 断开时登录 503。响应和日志没有原文密码或 token。

本次没有重跑过期令牌、错误算法、错误 issuer、audience、缺 sid、并发刷新和登录失败计数。这些仍以 2026-11-10 至 2026-11-15 的记录为准。

## 关联文档

- [阶段 05 第 8 节](../05-authentication/implementation.md)
