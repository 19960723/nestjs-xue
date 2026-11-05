# CHG-20261031-007：完善用户资料创建

- 日期：2026-10-31（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：已实现；数据库与 HTTP 未验证

## 背景与原因

用户授权按企业级开通方式完善创建用户。管理员只建资料，不经手密码。此前接口仍写已删除的 `name`、`age`，和当前 User 表不一致。

## 涉及模块与文件

- `project/src/modules/users/dto/create-user.dto.ts`
- `project/src/modules/users/dto/update-user.dto.ts`
- `project/src/modules/users/dto/query-user.dto.ts`
- `project/src/modules/users/users.service.ts`
- `project/src/modules/users/user.select.ts`
- `project/src/modules/users/entities/user.entity.ts`
- [阶段 04](../04-user-management/implementation.md)

## 具体变更

创建必填邮箱，trim 后转小写，最长 100。用户名、昵称、手机号、性别、头像可选；出现时空字符串不通过，`null` 可清空可空列。不接收密码、状态、登录时间和删除时间。更新使用去掉必填约束后的同一组资料字段，`email: null` 返回 400。创建和更新都不写 `password`。公开返回不含密码和 `deletedAt`。列表关键词匹配用户名、昵称或邮箱。唯一冲突按邮箱、用户名、手机号分别返回 409。

## 兼容性影响

创建和更新不再接受 `name`、`age`。多传 `password` 会被白名单拒绝。新建用户密码为空，在阶段 05 设密之前不能登录。

## 数据库影响

没有创建或应用迁移。若库仍是旧的 `name` 列，当前写入会在真实库上失败。

## 验证方式与结果

2026-10-31，Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1、TypeScript 6.0.3；运行目录 `project/`。使用占位 `DATABASE_URL`：`prisma validate`、`prisma generate --config prisma7.config.ts`、`tsc --noEmit --incremental false -p tsconfig.build.json`、`eslint src/modules/users --max-warnings=0`、`prettier --check src/modules/users` 均退出 0。未执行 Jest、HTTP、migrate 或真实连接。

## 关联文档

[阶段 04](../04-user-management/implementation.md)、[阶段 05](../05-authentication/implementation.md)。
