# ADR 0004：用户身份、会话与授权的默认策略

- 日期：2026-10-21
- 状态：提议
- 确认记录：产品策略待实施前确认；不影响本次文档交付
- 关联：阶段[02](../02-database/implementation.md)/[04](../04-user-management/implementation.md)/[05](../05-authentication/implementation.md)/[06](../06-authorization/implementation.md)/[07](../07-redis/implementation.md)

## 背景与候选方案

需要为软删唯一性、管理建号、退出和撤权定义跨阶段一致的规则。单纯无状态JWT无法保证退出立即失效；缓存权限会带来撤权窗口；在MySQL上用(email,deletedAt)唯一复合键无法约束多个NULL记录。

| 议题 | 默认决定 | 理由与代价 |
| --- | --- | --- |
| 用户ID | Int自增 | JSON无需BigInt转换，当前规模足够；超大规模另评审 |
| 身份归一化 | username小写ASCII，email按本项目规则trim/lowercase | 与DB唯一约束一致，邮箱大小写策略是产品约定 |
| 软删 | username/email永久占用；常规接口排除deletedAt | 简单可靠，恢复/复用需另定流程 |
| 管理建号 | PENDING+可空passwordHash | CRUD阶段不引入明文密码，ACTIVE必须有哈希 |
| 密码 | Argon2id，慢哈希 | 不允许MD5/SHA直接存人类密码 |
| JWT/Refresh | 15分钟Access+7天Refresh空闲期+30天session上限 | 兼顾体验与泄漏窗口；每次刷新受绝对期约束 |
| Refresh竞争 | 单次消费，检测旧token重放就撤销整session | 安全优先，客户端要single-flight，丢响应可能需重登录 |
| 撤销 | Access每请求校验DB用户/session/版本 | 即时生效，增加一次DB检查成本 |
| token传输 | 起点JSON给受控客户端，浏览器模式另评审Cookie/CSRF | 避免隐含前端存储/跨站点假设 |
| 注册/reset | 默认关闭；reset必须有可信交付 | 不在未具备渠道时返回敏感token或假完成 |
| 权限 | RBAC关联表+显式权限，默认AND/默认拒绝 | 不因忘记装饰器而公开；对象权限仍由Service检查 |
| 管理员 | 显式权限系统角色，保护最后有效管理员 | 不无条件bypass；新权限授权需审阅 |
| Redis | 不缓存安全事实，展示缓存最终一致 | 故障不影响撤销正确性；共享限流故障503 |

## 影响、迁移与回滚

这些策略作用于 Schema、DTO、Guard、客户端和测试，后续要改须同步所有影响阶段并补迁移。2026-10-23 已有基础用户 CRUD、Role/UserRole 与迁移文件，但仍为硬删除、数字状态，尚无认证/授权行为。当前不能假设空库；先明确存量字段映射、回填、唯一性与关联保留方案，再实施目标策略，本次不执行存量回填。若今后改变身份复用或 ID 类型，先评估外键、token sub、API 兼容与审计历史；不能直接改唯一索引并删除旧数据。

生产部署前要确认：客户端形态、注册策略、重置渠道、管理员来源、身份复用政策、保留期与备份目标。没有可信交付时重置功能关闭并保留未完成状态。

## 验证与重新评估

按05并发轮换/撤销、06默认拒绝/最后管理员竞争、07缓存失效/故障矩阵验收。当前仅方案，未执行。

## 依据

[RFC9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14)、[OWASP密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[MySQL NULL索引](https://dev.mysql.com/doc/refman/8.4/en/create-index.html)。
