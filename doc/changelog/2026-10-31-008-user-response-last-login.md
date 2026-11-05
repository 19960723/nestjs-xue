# CHG-20261031-008：用户响应补上最后登录时间

- 日期：2026-10-31（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：已实现；HTTP 未验证

## 背景与原因

User 表已有 `lastLoginAt`，公开响应模型还没包含它。

## 涉及模块与文件

- `project/src/modules/users/entities/user.entity.ts`
- `project/src/modules/users/user.select.ts`
- [阶段 04](../04-user-management/implementation.md)

## 具体变更

用户详情和列表增加可空的 `lastLoginAt`。仍不返回 `password` 和 `deletedAt`。

## 兼容性影响

成功响应多一个可空时间字段。创建和更新仍然不写它。

## 数据库影响

无。

## 验证方式与结果

2026-10-31，运行目录 `project/`。`tsc --noEmit --incremental false -p tsconfig.build.json`、`eslint src/modules/users --max-warnings=0`、`prettier --check` 目标文件退出 0。未执行 HTTP。

## 关联文档

[阶段 04](../04-user-management/implementation.md)。
