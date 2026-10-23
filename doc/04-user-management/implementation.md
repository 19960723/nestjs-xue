# 阶段 04：用户管理 CRUD

更新：2026-10-23。文档状态：已更新；功能状态：进行中（已有基础 CRUD 与 Swagger 响应模型，数据库业务及目标行为未验收）。前置：[02](../02-database/implementation.md)、[03](../03-api-standards/implementation.md)。本阶段接口仅在隔离本地回环地址开发，05/06完成后才能对外开放。

## 1. 阶段目标

实现受约束的用户资料CRUD、分页搜索、状态、软删除和原子批量操作；不处理明文密码，不在资料修改端点修改角色或凭据。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| 新增/详情/修改 | 管理基础资料 | P0 | User/DTO | 白名单响应、唯一冲突409 |
| 分页/搜索/排序 | 可控查询成本 | P0 | 03分页DTO | 相同过滤count、稳定排序 |
| 软删除 | 可恢复追踪且隔离已删用户 | P0 | deletedAt | 所有常规读取过滤，唯一身份保留 |
| 状态管理 | 禁用与启用 | P0 | status/tokenVersion | 原子更新，非法状态转换409 |
| 批量软删 | 保持全有或全无 | P1 | 事务 | 1..100个唯一ID，任一不存在整体失败 |
| Service/接口测试 | 提早固化不变量 | P0 | Jest骨架 | 成功/边界/冲突/回滚覆盖 |

## 3. 技术原理

Controller处理HTTP，Service负责不变量/事务，UsersRepository负责查询/白名单select。数据库唯一索引才是并发唯一性保障；先find再create只能改善提示，不能防竞争。软删不是仅修改DELETE代码，列表/详情/更新/认证全部需过滤deletedAt。

初期不引入Prisma全局软删扩展，Repository显式条件更容易审查；嵌套写和原始SQL不会“自动安全”。以 `id+deletedAt:null` 条件执行updateMany，再检查count，能避免先查后改时操作到已软删记录。相关写入短事务中完成，参考 [Prisma事务](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)。

## 4. 实现前准备

无新运行时依赖；复用02/03。Swagger的PartialType从`@nestjs/swagger`导入，避免额外引入mapped-types。

当前已移动到 `project/src/modules/users/`，保留已有 Module/Controller/Service、输入 DTO、OpenAPI User 和响应模型，不再执行 nest g 生成第二套骨架。AppModule 和 UsersService 已更新相对 `.js` 导入；UsersService 与原路径 HEAD 比较（忽略空白及路径层级）业务内容一致。Prisma 目录尚未移动，新增 Repository 与显式 PrismaModule 依赖单独实施；完整检查结果见本阶段第 8 节。

先核对 02 的当前模型及增量方案、03 的实际与目标契约，再改变字段或删除行为。测试恢复后补有价值的断言，本次不运行测试。当前尚无认证，开发监听 127.0.0.1 且不得发布到公网/共享环境；阶段 05 全局认证、06 权限后才切换目标 API 访问规则。

## 5. 详细实施步骤

### 当前实现收拢顺序（待用户实施）

1. 先完成目录移动，保留 name/email/age 输入、分页默认 1/10 和 `{list,total,page,pageSize}`、硬删除及原返回消息；目录批次不改 API。
2. 基于当前实际字段落实 public select/响应映射和显式写入白名单；已有 `entities/user.entity.ts` 与 `dto/user-response.dto.ts` 仅描述 OpenAPI，不会过滤 Prisma 实际输出。先防止未来敏感字段随 Schema 扩展而被直接返回，再按目标字段演进。
3. 新增具体 UsersRepository，迁入已有查询及数据库错误识别；Service 管业务、事务与 HTTP 语义转换，Controller 管路由与 DTO。UsersModule 显式导入同一 PrismaModule 后，再移除全局依赖；不重复注册客户端或创建 BaseRepository。
4. 单独补正整数 ID、email 长度、PATCH 的 undefined/null/空对象规则和 keyword 长度；当前 `+id`、PartialType 的 null 跳过和“所有 P2002 都报邮箱冲突”、先查后更新/删除的竞争窗口均需处理。异常含义按实际约束区分，不向外输出原始数据库错误。
5. 与 02/ADR0004 明确字段、状态映射与身份策略后，再单独实现软删/状态/版本及必要增量迁移；保留当前 name/age/phone/sex 数据，未明确映射前不直接替换为 username/nickname。最后按 03 独立切换统一包装、分页及删除契约。

下方 5.1～5.5 是完整阶段目标；只有前置模型/契约具备后才实施。数据库约束、事务和软删验收需隔离环境，目录和 Swagger 整理不能替代这些证据。

### 5.1 定义输入与安全输出

- 目标：防越权字段写入和敏感数据输出。
- 文件：新建 `project/src/modules/users/dto/{create-user,update-user,query-users,batch-delete-users,update-user-status}.dto.ts`、`user.select.ts`、`users.repository.ts`。
- 操作：create只收username、email、nickname；username trim/lowercase且正则`^[a-z0-9_]{3,32}$`，email trim/lowercase并IsEmail+MaxLength254，nickname最长64。禁止passwordHash/status/role/tokenVersion由create或通用patch写入。Update用PartialType再明确null策略：username/email不能null；nickname允许null清空（ValidateIf区分undefined/null），空PATCH返回400。

```ts
export const userPublicSelect = {
  id: true, username: true, email: true, nickname: true,
  status: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;
```

- 解释：从生成client导入Prisma类型，所有Repository公开返回均使用此select；认证单独使用私有凭据查询方法，不扩展这个select。Service不能直接`data: dto`信任批量赋值，显式组装允许字段。
- 命令：`pnpm run typecheck`、DTO测试。
- 预期/验证：传password/role/多余字段400，用户响应中没有passwordHash/版本/软删字段，null规则与OpenAPI一致。

### 5.2 实现新增与读取

- 目标：建立资料CRUD最小路径。
- 文件：修改 `users.controller.ts`、`users.service.ts`、`users.repository.ts`、`users.module.ts`。
- 操作：module导入PrismaModule，providers注册Service/Repository，只导出UsersService。create显式设PENDING、passwordHash:null；Service将P2002交全局安全映射409。详情使用findFirst `where:{id,deletedAt:null}`+public select，不存在404。列表构建一个where，username/email contains限制输入长度、status白名单，默认id desc；允许sortBy=id/createdAt、sortOrder=asc/desc且二级id消除相同createdAt歧义。

```ts
const [items, total] = await prisma.$transaction([
  prisma.user.findMany({ where, select: userPublicSelect, skip, take, orderBy }),
  prisma.user.count({ where }),
], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
return { items, total, page, pageSize };
```

- 解释：where/skip/take/orderBy由已验证DTO构建，不接收客户端Prisma JSON；组合status/软删索引无法优化所有contains搜索，初期限制长度/分页，规模上升再基于EXPLAIN设计索引或搜索。
- 命令：用户后续启动后按第7节curl；`pnpm test`运行新增/列表/404用例。
- 预期/验证：新增201、详情200、重复归一化邮箱409；列表total/过滤一致，已删记录不出现。

### 5.3 原子修改与状态变更

- 目标：并发写入不违反状态/凭据边界。
- 文件：修改Service/Repository、status DTO与测试。
- 操作：资料修改只允许非删除记录；updateMany按id/deletedAt条件，count=0为404，同事务再查公开资料。唯一冲突409。状态端点仅接收ACTIVE或DISABLED；PENDING用户在没有非空passwordHash时不能激活，返回409。禁用时原子设置状态并递增tokenVersion，05接入会话后同事务撤销所有会话；启用不自动恢复旧会话。状态本身不接受任意字符串。
- 命令：`pnpm test`，测试修改已删用户404、重复email409、无凭据PENDING→ACTIVE为409、PENDING→DISABLED成功。
- 预期/验证：generic PATCH改不了密码/权限/状态；禁用策略已写清楚，05再增加实际会话撤销断言，不提前标已验证。

### 5.4 实现软删除与批量操作

- 目标：避免物理删除与部分成功语义不明。
- 文件：修改Controller/Service/Repository及batch DTO。
- 操作：单删使用条件updateMany写deletedAt并递增tokenVersion，重复删除返回404；接口返回200+null。批量采用POST `/users/batch-deletion`，避免DELETE body兼容问题；ids为正Int数组，1..100、ArrayUnique，空/重复/越界400。事务中按未删除条件updateMany，count!=ids.length即throw404整笔回滚；05后加入session撤销，08后同tx插审计。管理员不能禁用/删除自己或最后一个有效管理员，06接入后加可串行化事务保护。
- 命令：`pnpm test`；隔离测试库用两个用户+一个不存在ID验证批量失败后两个用户仍可见。
- 预期/验证：软删用户后详情404、登录将拒绝，重建同username/email仍409；批量没有部分成功。生产硬删/清理不是HTTP接口，另行评审备份和保留策略。

### 5.5 用测试固定Repository和Service边界

- 目标：分开验证业务与真实数据库约束。
- 文件：新建 `project/src/modules/users/users.service.spec.ts`、`project/test/users.e2e-spec.ts`、`users.integration-spec.ts`。
- 操作：Service mock Repository覆盖成功、404、唯一冲突透传、非法状态、批量数量不符回滚；Repository集成测试覆盖唯一索引/真实事务/软删过滤；E2E使用03相同bootstrap与响应契约。不要只mock create返回预设值就宣称唯一约束已验证。
- 命令：运行09定义的test与隔离DB test:integration/test:e2e；未接入认证时测试夹具限定本地，05/06后升级401/403矩阵。
- 预期/验证：全部响应无敏感字段，count/list同过滤；并发创建同邮箱恰好一个成功、一个409。

## 6. 数据库设计

目标复用 02 的完整 User Schema，02 模型到位后本阶段不重复迁移。当前 Schema 尚无 deletedAt/版本等目标字段，不能按“无新迁移”直接实现软删；缺失字段和存量数据方案回到 [02 第 6 节](../02-database/implementation.md#6-数据库设计)处理。永久占用 username/email 是 ADR0004 中的目标策略，待明确后实施；版本字段只由 Service 更新。若后续需要恢复用户，必须另定状态/身份冲突/权限恢复规则；本阶段不提供恢复接口。

## 7. API 设计

### 当前代码契约与本次 Swagger 补充（2026-10-23）

现有实现已移动到 `project/src/modules/users/`，与下方阶段目标存在差异。本次以实际代码添加装饰器和响应模型，不变更业务行为。输入为 `name`（必填，最长 50）、`email`（必填，邮箱格式）、`age`（可选，整数 0..150）；Update 通过 Swagger 的 PartialType 将全部输入字段改为可选。可选字段的现有 IsOptional 会跳过 null，age 文档标记可空；name/email 的 null 与非空数据库约束冲突仍待后续处理，本次不改变校验。

| Method | 路径（前缀 /api/v1） | 当前请求与响应 | 已实现业务异常 |
| --- | --- | --- | --- |
| POST | /users | CreateUserDto → 201 User | 400 校验失败、409 邮箱冲突 |
| GET | /users | page=1、pageSize=10（上限100）、keyword 可选 → 200 `{list,total,page,pageSize}` | 400 校验失败 |
| GET | /users/:id | id → 200 User | 404 用户不存在 |
| PATCH | /users/:id | id + UpdateUserDto → 200 User | 400 校验失败、404、409 |
| DELETE | /users/:id | id → 200 `{message:"删除成功"}`，当前为硬删除 | 404 |

User 响应包含 id/name/email/age/status/phone/sex/createdAt/updatedAt；age/phone/sex 为必然存在但可为 null 的字段，日期在 JSON 中为 date-time 字符串。未 include 的 roles 不列入响应。当前无认证授权，不标记接口需要 Bearer；正整数 ID 校验、软删、public select、统一包装等阶段目标尚未完成。数据库约束和并发行为未在本次验收。

### 阶段目标契约（后续实施）

返回均使用[03包装](../03-api-standards/implementation.md)；User为public select字段，Page为`{items,total,page,pageSize}`。下表认证/权限是05/06后的上线目标；当前阶段仅限本地隔离开发。

| 接口名称 | Method | URL（前缀/api/v1） | 请求 | data | 正常码 | 异常码 | 认证/权限 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 新增用户 | POST | /users | username/email/nickname? | User(PENDING) | 201 | 400/401/403/409 | JWT/users:create |
| 列表 | GET | /users | page/pageSize/username?/email?/status?/sortBy?/sortOrder? | Page<User> | 200 | 400/401/403 | JWT/users:read |
| 详情 | GET | /users/:id | 正Int id | User | 200 | 400/401/403/404 | JWT/users:read |
| 修改资料 | PATCH | /users/:id | email?/username?/nickname? | User | 200 | 400/401/403/404/409 | JWT/users:update |
| 状态 | PATCH | /users/:id/status | status | User | 200 | 400/401/403/404/409 | JWT/users:update-status |
| 软删除 | DELETE | /users/:id | id | null | 200 | 400/401/403/404/409 | JWT/users:delete |
| 批量软删 | POST | /users/batch-deletion | ids:number[] | `{affectedCount:n}` | 200 | 400/401/403/404/409 | JWT/users:delete |

后续隔离开发或已获取管理token时执行：

```bash
curl -i -X POST http://localhost:3000/api/v1/users -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' --data '{"username":"alice","email":"alice@example.test"}'
curl -i 'http://localhost:3000/api/v1/users?page=1&pageSize=20&status=PENDING' -H "Authorization: Bearer $ACCESS_TOKEN"
curl -i -X PATCH http://localhost:3000/api/v1/users/1 -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' --data '{"role":"ADMIN"}'
```

最后一例对有权限调用者应400；无权限时先403，因为Guard先于DTO校验。

## 8. 验收标准

- [ ] CRUD/分页/搜索/排序/状态按表通过；未知字段、null规则和ID边界受控。
- [ ] 唯一竞争由索引兜底；查询使用public select。
- [ ] 软删对详情/列表/更新一致；软删身份不能重新注册。
- [ ] 批量空/重复/超量400，混合无效ID整体回滚。
- [ ] PENDING无哈希不可激活；本地管理功能没有被直接对外发布。
- [ ] Service单测+真实约束集成测试执行并留记录。

删除 Swagger 测试文件前的局部验收记录（2026-10-23）：用户 Swagger 契约已通过本地编译及 OpenAPI 生成测试；环境、命令和结果见[阶段 03 验收记录](../03-api-standards/implementation.md#8-验收标准)。验证当前 Create/Update 字段、分页默认值和上限、User 可空字段、列表及删除响应；未执行真实数据库 CRUD、并发约束或本阶段目标验收。随后按用户要求删除本次新增的 Swagger 测试文件，暂不运行测试；现有装饰器及响应模型保留。

移动后静态检查（2026-10-23）：Users 导入层级和模块注册已更新；检查初期生产类型检查、构建及测试代码类型检查通过，未运行测试。随后删除模板文件曾因 AppModule 遗留引用导致类型检查失败；用户已清理引用，最新生产/测试代码类型检查通过，旧 E2E 问候断言现已删除，整体整理未验收；本轮复查生产/测试代码类型检查、构建及定向 ESLint 通过，4 个文件格式检查未通过。完整命令、快照限制与待办见[整理检查记录](../changelog/2026-10-23-002-project-organization.md#目录移动后检查2026-10-23)。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| 先查重仍有重复请求失败 | 正常并发竞争，依赖唯一索引并安全映射409 |
| 软删用户又出现 | 查Repository漏deletedAt、select是否被include覆盖 |
| 批量部分生效 | 检查count断言是否在同事务内throw，是否误用外层client |
| Patch null绕过校验 | IsOptional会跳过null；按字段明确ValidateIf及验证器 |
| user不存在却报参数错误 | 检查路由/ParseIntPipe；静态批量路径使用独立HTTP method |

## 10. 后续扩展

[05](../05-authentication/implementation.md)增加凭据与会话，不把密码混入资料DTO；[06](../06-authorization/implementation.md)完成管理权限与管理员保护；08补事务审计。批量导入、硬删除、身份复用和全模糊检索均需单独业务需求。
