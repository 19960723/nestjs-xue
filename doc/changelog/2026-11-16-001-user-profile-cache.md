# CHG-20261116-001：用户详情展示缓存

- 日期：2026-11-16（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。用户详情展示缓存已接入；全局限流和故障演练未做，阶段 07 整体未完成

## 背景与原因

登录来源限流已经使用同一 Redis 客户端。用户详情可以短时复用这份连接，但不能另起一套缓存模块，也不能把会话或权限放进 Redis。

## 涉及模块与文件

- `project/src/infrastructure/redis/redis.service.ts`
- `project/src/modules/users/users.module.ts`
- `project/src/modules/users/users.service.ts`

## 具体变更

`RedisService` 增加展示缓存的读取、写入和删除。键只由服务内部按 `users:profile` 和用户 id 拼出。有效期 60～75 秒。

`GET /users/:id` 先用 MySQL 确认用户未删除，再读缓存。结构不对就当未命中。资料更新、首次设密、启用停用和软删除在提交成功后删除该键。列表、登录、会话和权限仍查 MySQL。缓存故障只记日志并回源。

## 兼容性影响

详情的公开字段最多可能陈旧 75 秒。已删除用户不会从缓存返回。没有新的 HTTP 状态码。

## 数据库影响

无 MySQL Schema 变更。没有新迁移。

## 验证方式与结果

Darwin arm64。工作目录 `project/`。`tsc --noEmit --incremental false -p tsconfig.build.json` 和改动文件的 ESLint、Prettier 退出码 0。

重启后，用临时账号走 HTTP：详情第一次 200，键的剩余时间在 60～75 秒；第二次仍是原昵称。资料更新 200，键被删掉。再次详情返回新昵称，并重新写入 60～75 秒的缓存。把缓存改成坏 JSON 后，详情仍返回新昵称，缓存被正确值覆盖。软删除 200，`data` 为 null。之后详情 404，缓存键不存在。临时用户和角色已从数据库删除，剩余 0。未做两实例并发，也没有停掉 Redis。阶段 07 不标为已验证。

## 关联文档

[阶段 07](../07-redis/implementation.md)、[阶段 04](../04-user-management/implementation.md)。
