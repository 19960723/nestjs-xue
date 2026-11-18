# CHG-20261118-003：标明身份规范化尚未按目标实施

- 日期：2026-11-18（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：进行中（维持当前用户名、邮箱和密码列；没有改代码，也没有改表）

## 背景与原因

2026-10-21 的 ADR 0004 写过更窄的用户名和列名提议。当前用户、登录和权限已经用现有规则跑通。按那个提议改会收紧合法用户名，并多一次迁移。这次确定不再实施，文档不再把它留成待办。

## 涉及模块与文件

- `doc/decisions/0004-security-and-data-policy.md`
- `doc/00-overview/project-overview.md`
- `doc/02-database/implementation.md`
- `doc/04-user-management/implementation.md`

## 具体变更

ADR 0004 保留原提议表，并写明不再实施更窄的用户名规则、254 位邮箱和 `passwordHash` 列名。当前用户名只去首尾空格，长度 1～50，保留大小写。邮箱去首尾空格并转小写，最长 100。密码列仍叫 `password`。软删除后的唯一身份占用保持不变。

阶段 02、04 改为以这份当前契约为准，不再把旧正则留成后续设计。

## 兼容性影响

没有 API、配置或依赖变化。

## 数据库影响

没有迁移，不改开发库，不 `reset`，不 `drop`。

## 验证方式与结果

本次只核对文档和现有 DTO，没有运行测试，也没有改代码。当前邮箱转换见 `project/src/modules/users/dto/create-user.dto.ts`：邮箱 `trim().toLowerCase()` 且最长 100；用户名只 `trim()`，长度 1～50。

## 关联文档

- [ADR 0004](../decisions/0004-security-and-data-policy.md)
- [阶段 02](../02-database/implementation.md)
- [阶段 04](../04-user-management/implementation.md)
