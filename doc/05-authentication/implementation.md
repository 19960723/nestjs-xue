# 阶段 05：身份认证系统

更新：2026-11-11。文档状态：已更新；功能状态：进行中（已有 Argon2id 哈希、首次设密、用户名登录、全局 Access Guard、`GET /auth/me`、Refresh 轮换、当前退出、全部退出、修改密码和登录失败限制。这些切片已本地 HTTP 验收。重置未实现，阶段整体未完成）。前置：[04](../04-user-management/implementation.md)及01的Jest工具。安全策略见 [ADR0004](../decisions/0004-security-and-data-policy.md)。默认命令在project/。

## 1. 阶段目标

建立密码安全、短期Access JWT、持久会话、Refresh轮换/重放检测、即时撤销和安全密码重置。不能把“客户端丢弃JWT”当退出已完成；禁用/删除/改密码必须让旧凭据失效。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| 注册/密码哈希 | 安全创建登录身份 | P0 | User/唯一索引 | 仅存Argon2id，注册开关有效 |
| 登录/Access JWT | 校验身份 | P0 | 用户/密钥 | issuer/audience/算法/过期受控 |
| Refresh轮换 | 延续会话并检测泄漏 | P0 | MySQL事务 | 每次只可用一次，重放撤销整会话 |
| Guard/当前用户 | 默认保护路由 | P0 | 会话/用户状态 | 缺token401，无敏感字段 |
| 退出/改密码 | 立即撤销 | P0 | 会话/tokenVersion | 旧Access和Refresh均失效 |
| 重置密码 | 无泄漏恢复凭据 | P0（启用前） | 可信交付渠道 | token随机、短期、单次、不可枚举 |
| 失败限制 | 防暴力尝试 | P0 | MySQL原子计数 | 并发尝试不能突破阈值 |

## 3. 技术原理

Argon2id带随机盐且计算成本可调，密码哈希不等于普通SHA摘要。JWT签名保证完整性，不加密payload，所以只放用户ID/会话ID/版本，不放密码、email或权限快照。

Access采用短期JWT，Refresh采用32字节随机opaque token，数据库只保存SHA-256摘要（随机高熵token可用摘要，不适用于人类密码）。每次刷新轮换，记录旧token已用；出现旧token再次使用撤销其session。参考 [RFC9700刷新重放防护](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14)；此处采用该安全原则，不宣称自行实现了完整OAuth服务器。

选择每请求查MySQL校验用户状态/tokenVersion/session撤销，牺牲纯无状态换取退出立即生效。初期不缓存这些安全检查；Redis坏了不能导致禁用账户重新可用。

## 4. 实现前准备

后续手动安装已核实版本：

```bash
pnpm add --save-exact @nestjs/jwt@12.0.3 argon2@0.45.1
pnpm exec nest g module modules/auth
pnpm exec nest g service modules/auth --no-spec
pnpm exec nest g controller modules/auth --no-spec
```

使用直接JwtService+自定义Guard，不额外增加Passport。新增配置：JWT_SECRET（至少32随机字节）、JWT_ISSUER、JWT_AUDIENCE、JWT_ACCESS_TTL_SECONDS=900、REFRESH_TTL_SECONDS=604800、SESSION_MAX_TTL_SECONDS=2592000、AUTH_REGISTER_ENABLED=false、AUTH_RESET_ENABLED=false、AUTH_LIMIT_HMAC_SECRET。校验整数上限/关系，密钥不得有默认值。生成密钥可后续在安全终端用 `openssl rand -base64 48`，不把输出写文档或提交。生产HTTPS，密钥轮换先支持验证旧/新密钥窗口或安排全会话撤销。

密码默认15～128字符（单因素起点），允许空格/Unicode，不trim、不截断、不强制无意义复杂度；DTO防超长消耗。Argon2id起点memoryCost=19456 KiB、timeCost=2、parallelism=1，再按生产硬件压测调整并发预算，依据 [OWASP密码存储建议](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。未压测前不能宣称参数适合所有负载。

## 5. 详细实施步骤

### 当前登录切片（2026-11-09）

本批只实现 `POST /api/v1/auth/login`。继续使用 Schema 里的 `UserSession`（`sys_user_session`），不新建迁移，不把下方草稿里的分表覆盖到现有表。

- 只接受 `username` 与 `password`。用户名按创建用户的规则 trim，最长 50；密码 15～128，不 trim。没有用户名或尚未首次设密的用户无法登录。
- 一行会话只保存一个 `refreshTokenHash`。本批创建会话并在响应中返回一次 Refresh 原文，不提供 `POST /auth/refresh`。轮换和重放检测留到后续增量。
- `User` 没有 `tokenVersion`。Access payload 只放 `sub`、`sid`、`jti`，不放 `ver`，也不放密码、邮箱或权限。
- 用户不存在、没有密码、已禁用、已软删或密码错误，都返回同一条 401。无用户或密码为空时，用同成本的预生成 Argon2id dummy 哈希校验一次。
- 校验通过后用短事务重读用户：未删除、`status` 为 1，且密码哈希未变，才插入会话。事务提交后再签 Access。签名失败则撤销这条尚未交付的会话，不返回 token。
- 登录切片本身不注册 Guard。全局校验见下一节。
- 配置增加必填的 `JWT_SECRET`（至少 32 个字符）、`JWT_ISSUER`、`JWT_AUDIENCE`。`JWT_ACCESS_TTL_SECONDS` 默认 900、上限 86400；`REFRESH_TTL_SECONDS` 默认 604800、上限 2592000。Access 有效期必须小于 Refresh 有效期。
- 本批不实现注册、退出、改密、密码重置和失败计数。`SESSION_MAX_TTL_SECONDS`、`AUTH_REGISTER_ENABLED`、`AUTH_RESET_ENABLED`、`AUTH_LIMIT_HMAC_SECRET` 仍不加入配置。

### 当前 Guard 切片（2026-11-10）

已接线。2026-11-10 本地 HTTP 验收见第 8 节。`AuthModule` 将 `JwtAuthGuard` 注册为 `APP_GUARD`。本批 `@Public()` 标在 `GET /health/live` 和 `POST /auth/login`。新增 `GET /api/v1/auth/me`，用 `userPublicSelect` 返回公开资料。继续使用现有 `UserSession`，本批不新建迁移，也不校验 `ver`。`User` 仍然没有 `tokenVersion`。刷新路由见下一节。

- 用户、角色和 `GET /auth/me` 没有有效 Access 时返回 401。
- 请求头必须是唯一的 `Authorization: Bearer <accessToken>`。验签固定 HS256、已配置的 issuer 和 audience。
- `sub` 与 `sid` 都必须是正整数的十进制字符串。会话主键是 Int。
- 再查会话：`id` 等于 `sid`、`userId` 等于 `sub`、`revokedAt` 为空、`expiresAt` 未过。对应用户未删除且 `status` 为 1。
- token、会话或用户无效都返回同一条 401「身份无效」。数据库异常返回 503，不放行。日志不记录 token。
- `req.user` 只放 `{ id, sessionId }`。`GET /auth/me` 再确认用户未删除且 `status` 为 1，查不到返回 401，不返回密码。
- Swagger 仍只由 `SWAGGER_ENABLE` 控制，本批不改变它的访问方式。用户、角色和 `GET /auth/me` 在文档中标记 Bearer。
- 不实现退出、改密、重置、失败计数和刷新轮换。

### 当前刷新切片（2026-11-10）

已接线。2026-11-10 本地 HTTP 验收见第 8 节。保留现有 `UserSession`。新增 `RefreshToken`，映射 `sys_refresh_token`。不用第 6 节的 UUID 草稿替换会话表，也不改写已应用迁移。

- `POST /api/v1/auth/refresh` 标 `@Public()`。请求体只有 `refreshToken`，必须是 43 位 base64url，不 trim。格式不对返回 400。成功响应与登录相同，并设置 `Cache-Control: no-store`。
- 登录在同一事务写入会话和第一条 Refresh 记录，两边摘要相同。会话行仍只保存当前摘要；用过的摘要留在新表。
- 刷新按摘要查找。未使用、未过期、会话未撤销且未过期、用户未删除且 `status` 为 1 时，用 `updateMany` 要求 `usedAt` 为空且未过期。影响行数为 1 才创建后继记录，并把会话当前摘要和 `expiresAt` 改成新值。
- 新到期时间取 `now + REFRESH_TTL_SECONDS` 与 `session.createdAt + SESSION_MAX_TTL_SECONDS` 中更早的一个。新增配置 `SESSION_MAX_TTL_SECONDS`，默认 2592000，上限 2592000，并且必须大于或等于 Refresh 有效期。
- 记录已经用过，或条件更新影响行数不是 1：同一事务写上会话 `revokedAt`，提交后再返回 401「身份无效」。不在事务内抛 401，避免撤销回滚。
- 未知、过期、会话已撤销、用户禁用或已软删只返回 401「身份无效」，不扩大撤销范围。数据库异常返回 503。事务写冲突最多再读两次。
- 客户端必须串行刷新。并行的另一次请求会撤销整段会话，先拿到的新令牌也会失效。
- 迁移只新建表，并把现有 64 位十六进制摘要回填为未使用记录。不重置库，不删除会话。
- 不实现退出、改密、重置和失败计数。`User` 在本批仍然没有 `tokenVersion`。

### 当前退出与改密切片（2026-11-10）

已接线。2026-11-10 本地 HTTP 验收见第 8 节。给 `User` 增加 `tokenVersion`，默认 0。Access 增加整数声明 `ver`。Guard 要求它与用户当前版本一致；没有 `ver` 的旧 Access 返回 401。用户公开响应不包含该字段。

- `POST /api/v1/auth/logout` 需要 Access。只把当前会话的 `revokedAt` 写上，不提升版本，其它登录保持有效。成功 `data` 为 null。同一张 Access 再次调用由 Guard 返回 401。
- `POST /api/v1/auth/logout-all` 需要 Access。先把 `tokenVersion` 加一，再撤销该用户尚未撤销的全部会话。旧 Access 和旧 Refresh 都失效。
- `PATCH /api/v1/auth/password` 需要 Access。`oldPassword` 与 `newPassword` 都是 15～128，不 trim。新哈希在事务外计算。事务内要求原哈希、版本、启用且未删除都未变，才替换密码、版本加一并撤销全部会话。原密码错误、未设密、已禁用或已删除都返回 401「原密码错误」。条件不满足返回 409「密码已变更」。响应 `Cache-Control: no-store`，不含密码或哈希。
- 登录、刷新、退出和改密在事务里先锁用户行，再改会话。签名使用事务中读到的版本。
- 用户资料更新仍不改状态。删除仍是硬删除，会话由外键级联移除。本批不新增禁用或软删接口。
- 不实现密码重置和失败计数。

### 当前登录失败限制（2026-11-11）

已接线。2026-11-11 本地 HTTP 验收见第 8 节。只限制 `POST /api/v1/auth/login`。Redis 尚未接入，计数放在 MySQL 表 `auth_attempt_buckets`。

- 每次登录先占用次数，再计算密码哈希。超过上限直接 429「尝试过于频繁」，并设置 `Retry-After` 为当前窗口剩余秒数。响应不区分是用户名桶还是来源地址桶。
- 用户名桶默认 15 分钟 10 次，来源地址桶默认 1 分钟 60 次。成功登录不减少次数。两个桶都用 HMAC-SHA256，库里不保存用户名或地址原文。密钥是必填的 `AUTH_LIMIT_HMAC_SECRET`，至少 32 个字符，没有默认值。
- 次数用 `INSERT ... ON DUPLICATE KEY UPDATE attempts = attempts + 1` 在事务里增加。并发请求按行锁串行，读到的是增加之后的值。增加会提交，超限不回滚。
- 来源地址只取直接连接的 `socket.remoteAddress`，不读取 `X-Forwarded-For`。IPv4 映射地址去掉 `::ffff:` 前缀。
- 每次登录顺带删除最多 100 条已到期的桶。没有单独的定时清理任务。
- 数据库故障返回 503，不继续核对密码。不实现注册和密码重置。

### 5.1 增量建表与凭据服务

- 目标：建立持久会话和安全哈希边界。
- 文件：修改 `project/prisma/schema.prisma`；新增 `project/src/modules/auth/password.service.ts`、`auth.repository.ts`；更新env校验/example。
- 操作：按第6节给User补反向关系，再加模型；PasswordService只暴露hash/verify，显式Argon2id，不返回hash到Controller。AuthRepository的私有凭据查询可select passwordHash，资料查询继续04白名单。旧PENDING空哈希用户不自动获得登录资格。
- 命令（后续隔离开发库）：`pnpm exec prisma migrate dev --name add_auth_sessions --create-only`，审阅再应用；generate/build。与02一样遇reset即停。
- 预期/验证：表/索引/FK正确，密码哈希格式为Argon2id，数据库中无原文密码或Refresh/reset token；错误日志也无这些值。

### 5.2 注册、登录和失败限制

- 目标：安全创建身份与会话，避免账号枚举/暴力破解。
- 文件：新建 `auth.service.ts`、`password.service.ts`、`login-limit.service.ts`、`dto/{register,login}.dto.ts`，修改UsersService私有接口。
- 操作：注册仅由开关控制公开；归一化username/email，与04规则一致，禁止输入status/roles。哈希在事务外计算，事务内创建ACTIVE用户；06后分配预置基础角色同tx完成。唯一冲突统一409，若产品要求隐藏已注册身份，另加邮件确认流程而不伪装现有契约。
- 登录：统一接受username+password；找不到/无hash/禁用/软删均返回相同401信息。不存在用户也进行一次固定dummy hash校验以减少时序差异（dummy hash用同成本预生成）。成功后短事务重新读取用户状态并创建session+首个Refresh摘要，防密码校验期间被禁用。事务提交后签Access；签名失败不返回token并撤销未交付session。
- 限制：Redis前先用AuthAttemptBucket做固定窗口准入；账号HMAC键每15分钟最多10次尝试，IP HMAC键每分钟最多60次，可配置并压测。参数化原子INSERT/ON DUPLICATE KEY UPDATE在事务内增加两个桶，超限返回429+Retry-After；在昂贵哈希前预占次数，不能“查计数再加”绕过并发。成功不清IP计数；桶到期定期清理，限制总键数/输入长度，可信代理配置决定IP来源。
- 命令：`pnpm test`，隔离库并发登录请求验证阈值，检查响应401而非500；使用测试fixture密码，不用真实账号压测。
- 预期/验证：注册201，登录200；禁止账户不能创建session；攻击阈值阻断，DB不可用返回503且不放行。07再加跨实例Redis入口限流，此处MySQL策略仍保留安全兜底。

### 5.3 签发并校验Access JWT

- 目标：所有非公开HTTP路由默认需要有效身份。
- 文件：新建 `guards/jwt-auth.guard.ts`、`project/src/common/decorators/{public,current-user,authenticated}.decorator.ts`、`project/src/common/types/authenticated-user.ts`；AuthModule注册APP_GUARD。
- 操作：JwtModule.registerAsync注入已验证配置；sign/verify固定HS256及issuer/audience/TTL；payload `{sub:String(user.id), sid:session.id, ver:user.tokenVersion}`，补jti=randomUUID，不使用用户输入算法。Guard对Public元数据放行，其余解析唯一Bearer token并verifyAsync（algorithms只允许HS256）；校验sub是正Int范围字符串、sid格式、ver整数，再查ACTIVE未删用户和其未撤销/未过期session，匹配session.userId与版本。
- Guard：数据库异常503，token/账户无效401；挂载经过挑选的req.user `{id,sessionId,tokenVersion}`，CurrentUser只返回该上下文。health/live、登录、refresh、已启用register/reset显式Public；`/auth/me`为Authenticated（06表示明确仅需登录）。
- 命令：Jest构造过期、错误issuer/audience、错误算法、缺sid、错误sub、有效签名但已撤销session的token；HTTP访问me。
- 预期/验证：全部无效情形401，依赖故障503，正常返回公开用户；token中不携带可过期的角色权限作为授权依据。Swagger工具路由按03独立保护。

### 5.4 原子轮换Refresh并检测重放

- 目标：并发下单次使用和会话族撤销可靠生效。
- 文件：新增 `refresh-token.service.ts`、`dto/refresh-token.dto.ts`，修改AuthService/Repository。
- 操作：`randomBytes(32).toString('base64url')`生成原文token，只交付一次；摘要查记录。刷新事务锁定/验证token、session、用户，检查未过期/未撤销/版本；新token的到期=min(now+7天,session绝对30天)。用updateMany条件`id, usedAt:null, expiresAt>now`标记旧token已用，count=1才创建后继摘要。
- 竞争处理：count=0或旧token已用时，在同事务撤销整个session并返回 `{kind:'replay'}`；事务提交后才在外层throw401。**不能在撤销后在事务内throw导致撤销回滚。**未知/过期token401；已经使用的记录至少保留到会话绝对过期，才能检测重放。事务冲突可按02有限重试，重试时重新读状态。
- 取舍：严格重放策略使并行两次刷新中一次可能先200，另一次触发全会话撤销；先返回的Access/新Refresh也失效。客户端必须single-flight刷新，不能并发重试；丢失刷新响应需重新登录。这一可观察行为需写进客户端契约。
- 命令：真实MySQL集成测试两个并发刷新、旧token再次请求、事务失败重试；模拟重放后查session.revokedAt是否已提交。
- 预期/验证：至多一个轮换成功，重放后整session失效；并发退出/禁用/改密需和session/user更新串行化，使用一致锁顺序User→Session→RefreshToken或Serializable+重试，不能发出仍可用的被撤销会话。

### 5.5 退出与修改密码

- 目标：服务端立即结束会话和旧凭据。
- 文件：修改AuthService/Controller、UsersService的禁用/软删事务；新增change-password DTO与测试。
- 操作：logout要求当前Access身份，更新当前session.revokedAt，幂等业务结果200；之后再用同Access会401（HTTP层不再保证重复调用200）。logout-all对用户tokenVersion加1并撤销全部session。改密验证旧密码，事务外新hash，事务内重新检查旧hash/版本未变化后替换、tokenVersion+1、撤销全部session/reset token，要求重新登录。
- 禁用/软删：04的事务补充撤销该用户所有session；重新启用不恢复token。Service修改密码不走通用user PATCH。
- 命令：登录→me200→退出→旧Access访问me401→旧Refresh401；两会话改密码后全部旧token401，新密码可登录、旧密码401。
- 预期/验证：退出不是只删客户端token；不依赖Redis黑名单保留时间。并发改密冲突409，不把新旧密码或hash记录审计。

### 5.6 完成受控密码重置

- 目标：无账号枚举、短期单次恢复。
- 文件：新增 `password-reset.service.ts`、`password-reset-delivery.ts`（注入式交付接口）、reset DTO/测试；邮件适配器在可信渠道确认后编写。
- 操作：请求端点对存在/不存在用户均202同一消息，按账号/IP限流；随机token摘要入PasswordResetToken，15分钟到期。链接只能拼接配置的可信前端origin，不能相信Host头。通过经确认的交付渠道发送原文token；API不回传token，日志不打印链接。交付失败记录脱敏事件并让该token失效，用户可再次请求；异步可靠投递如需重试需另设计受保护outbox，不能直接丢给未托管的Promise后声称可靠。
- 确认端点：摘要匹配、有效未用，事务条件消费usedAt，同时改hash/tokenVersion+1、撤销所有session和其余reset token；竞争只允许一次成功。不得自动登录；提交后安全通知不含密码。
- 开关：AUTH_RESET_ENABLED=false时返回对所有账号一致的503或不注册整个功能（本方案固定503），不能假返回202算已完成。交付渠道未选定就保留“计划中”，上线验收前要么完成可信渠道，要么明确关闭此功能。
- 命令：单元/隔离库测试使用内存Delivery fake捕获token用于断言，生产没有调试返回通道。未知邮箱/已知邮箱响应同形，两个并发确认只有一个200。
- 预期/验证：过期/已用/伪造token400统一无效信息，重新登录才获取新会话；代理本次不发送任何真实消息。

## 6. 数据库设计

当前会话表以 Schema 里的 `UserSession`（`sys_user_session`）为准，并已包含在 `20261031082805_add_role_permission`。删除用户时是 Cascade，不是下方草稿里的 Restrict。未建密码重置表，未改这张会话表。2026-11-02 增加 `AuthModule` / `PasswordService`，以及 `POST /users/:id/password`。2026-11-09 登录在校验通过后向该表现有列写入一条会话：`refreshTokenHash` 为 Refresh 原文的 SHA-256 十六进制摘要，`expiresAt` 由 `REFRESH_TTL_SECONDS` 计算，设备、IP 和 User-Agent 留空。不覆盖哈希，因此重放检测不放在这张表上。2026-11-10 的刷新切片另建 `sys_refresh_token` 保存每一次摘要和 `usedAt`，会话行只保留当前摘要。证据见 [CHG-20261102-002](../changelog/2026-11-02-002-initial-password.md)、[CHG-20261109-001](../changelog/2026-11-09-001-username-login.md) 与 [CHG-20261110-004](../changelog/2026-11-10-004-refresh-rotation.md)。

下方代码块仍是更早的目标草稿：会话与 Refresh Token 分表，主键为 UUID。当前以 Schema 里的 `UserSession` 为准，不能用草稿覆盖它。草稿中的分表轮换、重放检测和密码重置仍未落地。

在02的User增加 `sessions AuthSession[]`、`passwordResetTokens PasswordResetToken[]`；以下新表为本阶段原先拟定的 Schema 增量。FK Restrict防误删用户；到期会话/令牌按保留策略清理子表后父表，不在请求中硬删。

```prisma
model AuthSession {
  id            String         @id @default(uuid()) @db.VarChar(36)
  userId        Int            @map("user_id")
  user          User           @relation(fields: [userId], references: [id], onDelete: Restrict)
  revokedAt     DateTime?      @map("revoked_at") @db.DateTime(3)
  expiresAt     DateTime       @map("expires_at") @db.DateTime(3)
  createdAt     DateTime       @default(now()) @map("created_at") @db.DateTime(3)
  refreshTokens RefreshToken[]
  @@index([userId, revokedAt])
  @@index([expiresAt])
  @@map("auth_sessions")
}
model RefreshToken {
  id        String      @id @default(uuid()) @db.VarChar(36)
  sessionId String      @map("session_id") @db.VarChar(36)
  session   AuthSession @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  tokenHash String      @unique @map("token_hash") @db.Char(64)
  usedAt    DateTime?   @map("used_at") @db.DateTime(3)
  expiresAt DateTime    @map("expires_at") @db.DateTime(3)
  createdAt DateTime    @default(now()) @map("created_at") @db.DateTime(3)
  @@index([sessionId, expiresAt])
  @@index([expiresAt])
  @@map("refresh_tokens")
}
model PasswordResetToken {
  id        String    @id @default(uuid()) @db.VarChar(36)
  userId    Int       @map("user_id")
  user      User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  tokenHash String    @unique @map("token_hash") @db.Char(64)
  usedAt    DateTime? @map("used_at") @db.DateTime(3)
  expiresAt DateTime  @map("expires_at") @db.DateTime(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  @@index([userId, expiresAt])
  @@index([expiresAt])
  @@map("password_reset_tokens")
}
model AuthAttemptBucket {
  keyHash     String   @map("key_hash") @db.Char(64)
  windowStart DateTime @map("window_start") @db.DateTime(0)
  attempts    Int      @default(1)
  expiresAt   DateTime @map("expires_at") @db.DateTime(3)
  @@id([keyHash, windowStart])
  @@index([expiresAt])
  @@map("auth_attempt_buckets")
}
```

数据库保存摘要/撤销状态，不保存原文token。会话id就是该轮登录的family，不需额外TokenFamily表。事务条件消费必须检查影响行数；旧Refresh记录用于重放检测，不能轮换后立即删除。迁移按5.1增量，回滚只回应用前提是兼容新增表；真实数据不DROP回退。

## 7. API 设计

### 当前代码契约（2026-11-10）

前缀 `/api/v1`，成功响应仍走阶段 03 包装。已实现登录、全局 Access Guard、`GET /auth/me`、`POST /auth/refresh`、当前退出、全部退出和修改密码。登录和刷新成功的 `data` 为 `{accessToken,refreshToken,tokenType:"Bearer",expiresIn}`，`expiresIn` 取已校验的 `JWT_ACCESS_TTL_SECONDS`，并设置 `Cache-Control: no-store`。Access 业务声明含 `ver`。没有重置接口。

`GET /health/live`、`POST /auth/login` 与 `POST /auth/refresh` 公开。刷新公开只表示不接收 Access，仍要校验 Refresh 原文。其余现有 HTTP 路由，包括用户、角色和 `GET /auth/me`，都要求有效 Access。Swagger 仍只受 `SWAGGER_ENABLE` 开关控制。

| Method | 路径 | 当前请求与响应 | 已实现业务异常 |
| --- | --- | --- | --- |
| POST | /auth/login | username 必填且 trim 后 1～50，password 必填、15～128、不 trim → 200 TokenSet | 400 校验失败；401 用户名或密码错误；429 尝试过于频繁；503 数据库不可用 |
| POST | /auth/refresh | refreshToken 必填、43 位 base64url、不 trim → 200 TokenSet | 400 格式不正确；401 身份无效；503 数据库不可用 |
| GET | /auth/me | Bearer Access → 200 公开 User | 401 身份无效；503 数据库不可用 |
| POST | /auth/logout | Bearer Access → 200，data 为 null | 401 身份无效；503 数据库不可用 |
| POST | /auth/logout-all | Bearer Access → 200，data 为 null | 401 身份无效；503 数据库不可用 |
| PATCH | /auth/password | oldPassword、newPassword 均 15～128 且不 trim → 200，data 为 null | 400 校验失败；401 原密码错误；409 密码已变更；503 数据库不可用 |

登录 401 不区分用户不存在、未设密、已禁用、已软删和密码错误。Guard 的 401 也不区分缺 token、签名错误、过期、缺少或错误的 `ver`、会话撤销、会话过期、用户禁用或已软删。刷新 401 不区分未知、过期、重放、会话撤销、用户禁用或已软删。修改密码的 401 不区分原密码错误、未设密、已禁用和已删除。数据库查询异常返回 503，不放行。签名失败撤销未交付会话并返回 500，响应不含 token。`GET /auth/me` 不返回密码和 `tokenVersion`；用户已删除或已禁用时返回 401。

### 阶段目标契约（后续实施）

前缀/api/v1，响应按03。TokenSet的data=`{accessToken,refreshToken,tokenType:"Bearer",expiresIn:900}`；JSON Refresh适合受控API客户端。浏览器采用HttpOnly Cookie前须重写端点入参/CSRF/CORS/Set-Cookie测试，不能两种存储方式同时含糊使用。

| 接口名称 | Method/URL | 请求 | data | 正常码 | 异常码 | 认证/权限 |
| --- | --- | --- | --- | --- | --- | --- |
| 注册 | POST /auth/register | username/email/password/nickname? | 公开User | 201 | 400/403(关闭)/409/429/503 | Public，受开关控制 |
| 登录 | POST /auth/login | username/password | TokenSet | 200 | 400/401/429/503 | Public |
| 刷新 | POST /auth/refresh | refreshToken | TokenSet | 200 | 400/401/429/503 | Public路由+Refresh凭证 |
| 当前用户 | GET /auth/me | 无 | 公开User | 200 | 401/503 | Access/Authenticated |
| 当前退出 | POST /auth/logout | 无 | null | 200 | 401/503 | Access/Authenticated |
| 全部退出 | POST /auth/logout-all | 无 | null | 200 | 401/503 | Access/Authenticated |
| 修改密码 | PATCH /auth/password | oldPassword/newPassword | null | 200 | 400/401/409/503 | Access/Authenticated |
| 请求重置 | POST /auth/password-reset/request | email | null，同一提示 | 202 | 400/429/503 | Public，交付配置就绪 |
| 确认重置 | POST /auth/password-reset/confirm | token/newPassword | null | 200 | 400/429/503 | Public+单次token |

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' --data '{"username":"alice","password":"test-only-password-2026"}'
curl -i http://localhost:3000/api/v1/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"
curl -i -X POST http://localhost:3000/api/v1/auth/refresh -H 'Content-Type: application/json' --data "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

仅测试库fixture使用该示例密码；ACCESS/REFRESH_TOKEN在本机终端设置，不记录实际值。所有含token响应加Cache-Control:no-store；密码/token不得出现在URL query。

## 8. 验收标准

- [ ] 无原文密码/token入库/日志；hash参数和目标容器原生模块可运行。
- [ ] JWT签名/算法/issuer/audience/exp/业务payload和用户/session版本均验证。
- [ ] 旧Refresh重放导致已提交的session撤销；并发刷新结果符合严格策略。
- [ ] 退出、改密、禁用、软删后旧Access/Refresh立即失效；DB故障不放行。
- [ ] 失败计数并发安全；公开注册/reset开关受控，未知账号提示一致。
- [ ] 重置单次/到期/竞争和可信交付验收；未配置渠道时保持关闭且未完成。

验收记录：登录、Guard、刷新、退出、修改密码和登录失败限制已本地 HTTP 验收，证据见下方记录和 [CHG-20261110-003](../changelog/2026-11-10-003-access-guard-http.md) 至 [CHG-20261111-001](../changelog/2026-11-11-001-login-attempt-limit.md)。过期 token、错误算法、数据库 503、禁用和软删用户尚未覆盖。重置未实现。密码重置交付渠道与浏览器 token 存储方案待产品确认。阶段 05 整体仍为进行中。

2026-10-31 UserSession 仅做 Schema 检查：Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1；运行目录 `project/`。占位 `DATABASE_URL` 下 `prisma validate` 与 `prisma generate --config prisma7.config.ts` 退出 0。未改业务模块，未执行 tsc、Jest、migrate 或真实连接。证据见 [CHG-20261031-006](../changelog/2026-10-31-006-user-session.md)。

2026-11-09 用户名登录只做静态检查，命令和结果见 [CHG-20261109-001](../changelog/2026-11-09-001-username-login.md)。未执行 Jest、HTTP 或迁移。不将阶段 05 标为已验证。

2026-11-10 Guard 切片只做静态检查：`tsc --noEmit -p tsconfig.build.json` 与改动目录 ESLint 退出码 0。`pnpm run test:e2e` 在应用初始化阶段超过 5000 毫秒，没有发出 HTTP 请求。不将阶段 05 标为已验证。证据见 [CHG-20261110-002](../changelog/2026-11-10-002-access-guard.md)。

2026-11-10 登录与 Guard 的 HTTP 验收：Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1；运行目录 `project/`。已有进程 `pnpm run start` 监听 `http://127.0.0.1:3000`。临时用户 `verify-guard-20261110` 使用文档中的测试密码创建，验收后连同会话删除。命令 `node --env-file=.env scripts/verify-access-guard.mjs` 退出码 0。未记录 token、密码或连接串。

| 请求 | 结果 |
| --- | --- |
| GET /api/v1/health/live，无 token | 200，`code=OK`，`data.status=ok` |
| GET /api/v1/auth/me、/users、/roles，无 token | 401，`UNAUTHENTICATED`，「身份无效」 |
| POST /api/v1/auth/login，错误密码 | 401，「用户名或密码错误」，`Cache-Control: no-store` |
| POST /api/v1/auth/login，正确密码 | 200，`tokenType=Bearer`，`expiresIn=900`，`Cache-Control: no-store`；Access 声明只有 `sub`、`sid`、`jti` 及标准时间字段；库中 Refresh 为原文的 SHA-256 |
| GET /api/v1/auth/me 与 GET /api/v1/users，有效 Access | 200；响应无 `password` |
| GET /api/v1/auth/me，伪造 Bearer | 401，「身份无效」 |
| 将会话 `revokedAt` 写上后，原 Access 访问 /auth/me | 401，「身份无效」 |

未覆盖过期、错误算法、数据库 503、禁用和软删。刷新、退出和重置未验收。阶段 05 不标为已验证。证据见 [CHG-20261110-003](../changelog/2026-11-10-003-access-guard-http.md)。

2026-11-10 刷新轮换的 HTTP 验收：Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1；运行目录 `project/`。先应用只增表的迁移 `20261110151500_add_refresh_token`，应用后库相对 Schema 的 diff 为空。随后重启 `pnpm run start`，监听 `http://127.0.0.1:3000`。临时用户 `verify-refresh-20261110` 使用文档中的测试密码创建，验收后连同会话和 Refresh 记录删除。命令 `node --env-file=.env scripts/verify-refresh.mjs` 退出码 0。未记录 token、密码或连接串。

| 请求 | 结果 |
| --- | --- |
| POST /api/v1/auth/login，正确密码 | 200，`tokenType=Bearer`，`expiresIn=900`，`Cache-Control: no-store`；Access 声明只有 `sub`、`sid`、`jti` 及标准时间字段；第一条 Refresh 摘要未使用 |
| POST /api/v1/auth/refresh，使用该 Refresh | 200，同样的令牌形态和 `no-store`；旧摘要已标记使用，新摘要未使用，会话仍指向新摘要且未撤销 |
| 再次使用旧 Refresh | 401，「身份无效」；会话 `revokedAt` 已提交 |
| 使用轮换得到的新 Refresh，以及对应 Access 访问 /auth/me | 均为 401，「身份无效」 |
| POST /api/v1/auth/refresh，格式不对 | 400，`VALIDATION_ERROR` |
| POST /api/v1/auth/refresh，43 位但库中不存在 | 401，「身份无效」 |
| 同一 Refresh 并行请求两次 | 一次 200、一次 401；会话已撤销，先返回的新 Refresh 再使用也是 401 |

未覆盖 Refresh 过期、会话绝对上限、禁用和软删用户、数据库 503，以及事务冲突重试。退出和重置未验收。阶段 05 不标为已验证。证据见 [CHG-20261110-004](../changelog/2026-11-10-004-refresh-rotation.md)。

2026-11-10 退出与修改密码的 HTTP 验收：Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1；运行目录 `project/`。先应用 `20261110164600_add_user_token_version`，只给 `users` 增加默认 0 的 `token_version`。应用后库相对 Schema 的 diff 为空。随后重启 `pnpm run start`，监听 `http://127.0.0.1:3000`。临时用户 `verify-revoke-20261110` 使用文档中的测试密码创建，验收后连同会话删除。命令 `node --env-file=.env scripts/verify-session-revoke.mjs` 退出码 0。未记录 token、密码或连接串。

| 请求 | 结果 |
| --- | --- |
| 同一用户登录两次 | 都是 200。Access 声明含 `ver` |
| 第一次登录的 Access 访问 /auth/me，然后 POST /auth/logout | 先 200，退出后 `data=null`。同一 Access 和配套 Refresh 再使用都是 401 |
| 第二次登录的 Access 访问 /auth/me | 200。当前退出没有影响另一次登录 |
| POST /auth/logout-all | 200，`data=null`。该 Access 和配套 Refresh 再使用都是 401 |
| PATCH /auth/password，原密码错误 | 401，「原密码错误」 |
| PATCH /auth/password，新密码过短 | 400，`VALIDATION_ERROR` |
| PATCH /auth/password，原密码正确 | 200，`data=null`，`Cache-Control: no-store`。旧 Access、旧 Refresh 和旧密码登录都是 401，新密码登录 200 |
| 同一 Access 并行提交两个不同新密码 | 一次 200、一次 409。两个新密码里只有一个能登录 |

未覆盖禁用、软删、数据库 503 和无 `ver` 的旧 Access。用户接口仍没有禁用和软删。重置未验收。阶段 05 不标为已验证。证据见 [CHG-20261110-005](../changelog/2026-11-10-005-session-revoke.md)。

2026-11-11 登录失败限制的 HTTP 验收：Darwin arm64、Node 24.18.0、pnpm 11.13.1、Prisma 7.10.1；运行目录 `project/`。先应用 `20261111151500_add_auth_attempt_bucket`，只新建 `auth_attempt_buckets`。应用后库相对 Schema 的 diff 为空。随后重启 `pnpm run start`，监听 `http://127.0.0.1:3000`。两个临时用户使用文档中的测试密码，验收后删除。命令 `node --env-file=.env scripts/verify-login-limit.mjs` 退出码 0。未记录 token、密码、HMAC 或连接串。

| 请求 | 结果 |
| --- | --- |
| 同一用户名先正确登录 1 次，再错误登录 9 次 | 第 1 次 200，随后 9 次都是 401 |
| 第 11 次使用正确密码 | 429，`RATE_LIMITED`，「尝试过于频繁」，`Retry-After` 为正整数 |
| 另一个用户名并行错误登录 15 次 | 10 次 401，5 次 429，没有其它状态码 |

未覆盖来源地址每分钟 60 次的上限、数据库 503 和到期桶清理。重置未验收。阶段 05 不标为已验证。证据见 [CHG-20261111-001](../changelog/2026-11-11-001-login-attempt-limit.md)。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| 退出后Access仍可用 | Guard仅验签，漏查session/状态/版本，或错误使用缓存 |
| 重放检测后撤销无效 | 撤销后在事务内throw，导致更新回滚；提交后再抛401 |
| 两个刷新都成功 | 条件消费没检查count，或使用不同事务/无隔离 |
| Argon2在镜像中加载失败 | 不复制macOS node_modules；在匹配Linux/CPU基础镜像安装构建 |
| JwtService expiresIn类型错误 | 配置使用已校验的数字秒，避免泛string直接传入类型联合 |
| 登录异常被当401 | 区分凭证失败与DB/密钥依赖故障，不泄漏内部细节但保留503 |

## 10. 后续扩展

[06](../06-authorization/implementation.md)添加实时权限，不依赖JWT角色快照；[07](../07-redis/implementation.md)共享限流；08清理到期会话/桶。MFA、SSO、Cookie模式、设备列表、异常登录检测按需求单独评审。
