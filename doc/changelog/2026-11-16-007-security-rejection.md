# CHG-20261116-007：拒绝事件安全日志

- 日期：2026-11-16（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。登录失败和权限拒绝已记安全日志；上传和定时任务未做，阶段 08 整体未完成

## 背景与原因

成功变更已经写入审计表。登录失败和权限拒绝没有改成数据，不能写成成功审计。

## 涉及模块与文件

- `project/src/modules/audit/audit.service.ts`
- `project/src/modules/auth/auth.service.ts`
- `project/src/modules/authorization/permissions.guard.ts`
- `project/src/common/logging/json-logger.ts`

## 具体变更

登录失败和权限拒绝各写一条 JSON 安全日志，事件名是 `security.rejected`。动作只有 `auth.login` 或 `access.denied`。权限拒绝可以带已登录用户的数字 id。日志不进入 `audit_logs`，也不出现在 `GET /audit-logs`。不保存用户名、密码、哈希或令牌。日志写失败时仍返回原来的 401 或 403。

## 兼容性影响

标准输出多一种警告日志。HTTP 状态和响应正文不变。审计表结构不变。

## 数据库影响

无 Schema 变更。拒绝事件不插入审计行。

## 验证方式与结果

2026-11-16 用临时账号核对。错误登录返回 401 `UNAUTHENTICATED`，安全日志动作是 `auth.login`，没有操作者。已登录但没有 `audit:read` 时访问审计列表返回 403 `FORBIDDEN`，安全日志动作是 `access.denied`，操作者是该用户的数字 id。成功登录没有拒绝日志。这三次请求都没有写入 `audit_logs`。日志里没有密码。临时用户已删除，剩余 0。

## 关联文档

[阶段 08](../08-common/implementation.md)。
