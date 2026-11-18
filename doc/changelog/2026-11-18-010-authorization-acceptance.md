# CHG-20261118-010：阶段 06 隔离库核对

- 日期：2026-11-18（Asia/Shanghai）
- 变更类型：核对
- 文档状态：已更新
- 功能状态：已验证（本地）。permissionVersion 和批量删除不实现

## 背景与原因

阶段 06 的权限 Guard、角色分配和管理员保护已经落地。这次用同日隔离库套件核对，并在同一测试库再跑一次权限种子。

## 涉及模块与文件

- `doc/06-authorization/implementation.md`
- `doc/README.md`
- `doc/00-overview/roadmap.md`

没有改应用代码。

## 具体变更

阶段 06 标为已验证（本地）。不增加 permissionVersion，也不做批量删除。

## 兼容性影响

没有 API、配置或依赖变化。

## 数据库影响

使用已有隔离库 `init_xue_test_mwlzd4jv`，只在 `127.0.0.1`。第二次种子没有新增权限或管理员密码。没有 reset，没有 drop，开发库未改。

## 验证方式与结果

环境：win32 x64、Node 24.22.2，目录 `project/`。`pnpm run test:integration:auth` 退出 0，2 个套件、19 项通过。

本次覆盖：无令牌 401，无权限 403，有读取权限可以看用户列表；撤掉角色后原 Access 下一次访问用户列表是 403；角色创建、重复编码 409、修改、替换权限和删除与审计同一事务；最后一名管理员不能被清空；两名管理员同时互清时一个成功、一个冲突。

同一隔离库再执行权限种子，退出 0，输出仍是 `permissions 12 admin-links 12 member-links 0`。

系统角色冲突、修改自己的角色和多权限同时要求，仍以 2026-11-12 的记录为准，本次没有重跑。

## 关联文档

- [阶段 06 第 8 节](../06-authorization/implementation.md)
