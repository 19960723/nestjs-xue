# 阶段 06：RBAC 权限系统

更新：2026-10-30。文档状态：已更新；功能状态：RBAC 计划中（角色资源 CRUD 已实现，类型/构建通过，数据库行为未验收，授权未实现）。前置：[05](../05-authentication/implementation.md)。命令默认 project/，本阶段完成前不得将用户管理对外开放。

## 1. 阶段目标

把“是谁”与“能做什么”分开，实现用户—角色—权限多对多关系、权限装饰器/Guard、管理接口和默认拒绝；撤销权限在下一次请求生效。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| RBAC数据模型 | 角色复用与扩展 | P0 | User/迁移 | 唯一组合与FK正确 |
| 权限标识/种子 | 可审阅授权目录 | P0 | 权限清单 | 幂等，无默认管理员密码 |
| 角色/关联管理 | 管理权限分配 | P0 | 事务 | 替换全量、非法关联回滚 |
| Permission Guard | 端点默认拒绝 | P0 | 认证上下文 | 匿名401、无权403、遗漏元数据403 |
| 管理员保护 | 避免越权与锁死 | P0 | 系统角色 | 不能删除/降权最后有效管理员 |
| 变更失效/测试 | 防旧权限长期生效 | P0 | MySQL实时读取 | 撤权即时，无缓存放行 |

## 3. 技术原理

Auth Guard先验证身份，PermissionsGuard再从MySQL查未删除ACTIVE用户关联的有效角色/权限。使用Nest Reflector读取handler/class元数据，不能只相信前端菜单或JWT角色字符串。权限是资源:动作，例如`users:read`，默认多项权限AND匹配；未来要OR时用显式策略，不能默默改变语义。

角色用于组织权限，权限Guard用于接口级校验，Service还要检查目标对象/归属以及管理员保护。参考 [Nest授权](https://docs.nestjs.com/security/authorization)；本项目沿用自建薄Guard与表，不额外加入权限框架，也不切换到文档中可能出现的新认证套件。

## 4. 实现前准备

无新外部依赖，使用@nestjs/core的Reflector、已安装Prisma/Jest。准备permission清单：users:create/read/update/update-status/delete，roles:read/write，permissions:read，users:assign-roles，files:upload/read（08才启用），audit:read。

默认角色`member`仅可访问明确Authenticated的自身端点；`admin`显式拥有已声明的全部管理权限，不采用无条件超级管理员bypass。新增权限必须经种子清单审阅后再授予，不使用匹配所有字符串的`*`。

## 5. 详细实施步骤

### 5.1 建立Schema与幂等权限目录

- 目标：可扩展RBAC，不把用户角色硬编码为enum。
- 文件：修改 `project/prisma/schema.prisma`；新建 `project/prisma/seed-rbac.ts`、`project/scripts/bootstrap-admin.ts`；脚本编译配置后续纳入package。
- 操作：先比对第 6 节目标与已有 Role/UserRole、User.roles，不重复建表或增加同名关系。采用增量方案补齐权限及系统角色字段，并评估字段/主键/外键变化。种子以 code upsert 权限/系统角色/关联，重复执行不新增重复项、不覆盖人工创建角色、不自动赋予所有普通用户 admin。member/admin 设 isSystem，不能通过 API 删除/修改 code/admin 权限集。
- 初始化管理员：独立一次性命令，从交互输入或临时Secret读取账号/密码，Argon2id哈希，事务创建/确认身份并分配admin；存在同名账号但身份不符立即停止，不静默提权。脚本不放通用默认密码、不自动在每次启动执行。
- 命令（后续）：`pnpm exec prisma migrate dev --name add_rbac --create-only`，审阅后应用、generate；为seed/bootstrap单独tsc配置编译到`.scripts-dist`再Node运行，不能直接Node执行带Nest装饰器的TS。命令接入后记录具体脚本/结果。
- 预期/验证：种子两次执行行数不变；无权限授予意外扩大，bootstrap失败不遗留半个管理员；05注册默认角色关联放进同一事务。

### 5.2 定义授权元数据与Guard顺序

- 目标：所有路由都明确声明访问策略。
- 文件：新建 `project/src/common/decorators/require-permissions.decorator.ts`；使用05的Public/Authenticated；新建 `project/src/modules/authorization/guards/permissions.guard.ts`、`authorization.service.ts`、`authorization.module.ts`；修改AppModule。
- 操作：`RequirePermissions(...codes)`内部SetMetadata字符串数组，空数组视配置错误；PermissionsGuard通过getAllAndOverride读取handler优先策略。Public放行，Authenticated明确仅需有效req.user，其余必须有非空权限声明并全部满足；没有元数据返回403。装饰器互斥，测试中发现Public与权限并存就失败。

```ts
@RequirePermissions('users:delete')
@Delete(':id')
remove(@Param('id', ParseIntPipe) id: number) {
  return this.usersService.remove(id);
}
```

- Guard注册：全局顺序Auth先Permissions后，在AppModule/全局Provider配置中集中声明，并移除05在AuthModule中的旧APP_GUARD绑定以免重复运行，不能分散注册并假定顺序；必要时由一个组合Guard顺序await调用两个Provider。不得让Auth依赖Authorization又互相import。普通路由认证失败401；已认证但无元数据/无权403；数据库故障503。
- 命令：`pnpm test`，测试记录两个Guard调用顺序、所有路由元数据覆盖、匿名先401、无权限403、显式Authenticated可过。
- 预期/验证：忘记装饰器的新增管理接口不会公开；Public只用于明确的认证入口和存活探针。

### 5.3 实现角色与关联管理

- 目标：分配行为可原子审查和撤销。
- 文件：新建 `project/src/modules/authorization/{roles.controller,permissions.controller,authorization.repository}.ts`、dto目录；修改UsersController增加roles端点。
- 操作：角色code匹配`^[a-z][a-z0-9_-]{2,31}$`，唯一且创建后不改；name最长64，description最长255。列表分页复用03。角色权限/用户角色使用PUT全量替换，DTO id数组允许空（表示清空）、最多100且唯一；事务验证所有ID存在/角色enabled，删除旧关系并createMany新关系，失败全部回滚。
- 授权边界：调用者必须具备roles:write或users:assign-roles；还不能授予自己并不拥有的权限，禁止为自己增权和自改角色；系统admin的初始维护通过专用种子/恢复流程。删除已分配角色返回409，先显式解除关联；系统角色不可删除/禁用。用户资料端点继续拒绝roles字段。
- 命令：单测/集成测试空数组清空、无效ID、重复、超量、跨权限授予、删除有用户角色、系统角色操作。
- 预期/验证：关联唯一、外键有效、失败无部分关联；已软删用户不能分配角色。

#### 5.3.1 当前角色 DTO 完善（2026-10-26）

用户授权完善 `modules/roles/dto/create-role.dto.ts`。当次已有 RolesController/Service 骨架，Service 返回占位字符串；该次仅完善创建 DTO 及更新 DTO 的继承校验，不实施角色 CRUD、查询 DTO、权限或数据库迁移。后续创建逻辑见第 5.3.3 节。现有 Schema 的 name/code 长度为 50、description 为 255，仍使用数字 status/sort；本节记录当前契约，上方小写 code/长度 32、name 长度 64、enabled 及 code 创建后不可修改属于未来 RBAC 目标，尚未实施。

| 字段 | 当前输入规则 | 缺省与空值 |
| --- | --- | --- |
| name | 字符串，去除首尾空白后长度 1～50 | 创建必填，禁止 null、空串及纯空白 |
| code | 字符串，去除首尾空白后长度 2～50，匹配 `^[A-Za-z][A-Za-z0-9_-]{1,49}$`；保持大小写 | 创建必填，禁止 null；创建时由数据库唯一索引和 Service 冲突映射保证 |
| description | 字符串，去除首尾空白后最长 255 | 可省略、null 或空串；null 表示清空 |
| status | JSON 整数，仅 0（禁用）或 1（启用） | 可省略，数据库默认 1；禁止 null、字符串和布尔值 |
| sort | JSON 整数，范围 0～2147483647（MySQL Int 上界） | 可省略，数据库默认 0；禁止 null、字符串和布尔值 |

创建 DTO 不设置属性默认值，避免 PartialType 继承后让 PATCH 隐式写入 status/sort。更新 DTO 使用 `PartialType(CreateRoleDto, { skipNullProperties: false })`，允许省略字段，仅 description 允许 null。当前仍允许更新 code 和空 PATCH；code 不可变、空 PATCH 拒绝等行为随完整角色业务另行实施。Swagger 与上述运行时约束保持一致，默认值由第 5.3.3 节创建逻辑交给数据库处理。

实现状态：上述 DTO 已实现，类型检查、构建及本次 DTO 的 ESLint/Prettier 通过；按阶段 09 现有约定暂不新增或执行测试，运行时及 HTTP 行为待验证。影响为更严格的输入校验及新增可选字段，无依赖、Schema 或迁移变更。证据见第 8 节及 [CHG-20261026-001](../changelog/2026-10-26-001-role-dto-validation.md)。

#### 5.3.2 当前角色查询 DTO 完善（2026-10-26）

用户后续授权完善空文件 `modules/roles/dto/query-role.dto.ts`，已导出 `QueryRoleDto`。2026-10-30 已接入列表 Controller/Service。沿用当前用户列表分页默认 1/10，不提前切换阶段 03 目标的 1/20。

| 字段 | 输入规则 | 缺省与空值 |
| --- | --- | --- |
| page | 整数 1～2147483647 | 省略为 1，拒绝 null |
| pageSize | 整数 1～100 | 省略为 10，拒绝 null |
| keyword | 字符串，trim 后最长 50，用于后续按角色名称或编码模糊搜索 | 可省略；空串/纯空白表示不筛选，拒绝 null |
| status | 整数，仅 0（禁用）或 1（启用） | 可省略，表示不筛选；拒绝 null |

数字字符串仅接受十进制数字字符，再交给整数和范围校验；不将空串、空白、小数、科学计数法、十六进制、布尔值、数组或对象强制转换成合法数字。不新增排序查询参数；列表固定 `sort` 升序、`id` 降序。keyword 非空时按 name/code 模糊匹配，status 传入时精确筛选，语义见第 5.3.4 节。

实现状态：QueryRoleDto 已实现并已接入列表；类型检查、构建及目标文件静态检查见第 8 节。运行时、OpenAPI 生成及数据库行为未验证，测试继续按阶段 09 约定暂缓。完整 RBAC 仍计划中。

#### 5.3.3 当前创建角色逻辑（2026-10-26）

用户授权完善 `modules/roles/roles.service.ts` 的 create。已注入现有 PrismaService，RolesModule 显式导入同一个 PrismaModule；保持现有全局作用域，不新增 Repository 或重复注册客户端。当时仅实现创建；列表、详情、更新、删除见第 5.3.4 节，授权仍未实现。

- HTTP 输入校验和 trim 继续由 CreateRoleDto 与全局 ValidationPipe 承担，Service 显式只写 name/code/description/status/sort，不接受 id、时间或关联关系的批量赋值。
- 按当前 Schema/迁移，只有 code 唯一，name 可重复；原代码注释中的 name 唯一不是已实现约束，本次不改表或增加此规则。直接 create 并捕获生成客户端的 PrismaClientKnownRequestError/P2002，映射为 `ConflictException('角色编码已存在')`（HTTP 409），以唯一索引保障并发；其他异常原样抛出，不误报为编码冲突。
- description 省略时使用数据库的可空行为，status/sort 省略时使用数据库默认值 1/0，显式 0 必须保留。成功返回白名单 id/name/code/description/status/sort/createdAt/updatedAt，不返回关联 users。
- 检查时本地生成客户端只含 User，与已有 Schema 的 Role/UserRole 不一致；已使用已安装的 Prisma 7.10.1 按现有 Schema 重新 generate。该步骤仅更新忽略入库的本地代码，不加载个人环境文件、不连接数据库、不创建或应用迁移。

功能状态：创建逻辑已实现，列表/详情/更新/删除见第 5.3.4 节。创建已存在的真实表是否可用、重复/并发编码、默认值和 HTTP 行为均须隔离数据库验收，不能凭静态检查判定通过。证据见第 8 节及 [CHG-20261026-002](../changelog/2026-10-26-002-role-create.md)。

#### 5.3.4 当前角色资源 CRUD（2026-10-30）

用户授权补齐角色列表、详情、更新、删除，对齐已有创建链路，不实施权限 Guard、用户-角色分配、Repository 或数据库迁移。PrismaModule 显式导入；公开字段复用 `rolePublicSelect`。仍无认证，接口仅限隔离本地。

- `GET /roles` 接入 `QueryRoleDto`：keyword 非空时 name/code `contains`，status 传入时精确匹配；分页默认 1/10；返回 `{list,total,page,pageSize}`，与当前用户列表字段一致，不提前改为 `items`。
- `GET /roles/:id`、`PATCH /roles/:id`、`DELETE /roles/:id` 使用 `ParseIntPipe`；不存在返回 404「角色不存在」。
- 更新显式写入 name/code/description/status/sort，undefined 交给 Prisma 跳过；仍允许改 code 和空 PATCH。code 冲突 409。
- 删除在同一事务内确认角色存在且 `user_roles` 计数为 0 后物理删除；已分配则 409「角色已分配给用户，无法删除」，避免当前 Cascade 外键误清关联。成功返回 `{message:'删除成功'}`，未切换阶段 03 的 `data:null`。
- 删除空文件 `dto/role.vo.ts`。未加权限装饰器，完整 RBAC 仍计划中。

### 5.4 保护管理员与即时撤权

- 目标：保持系统可管理且变更立即生效。
- 文件：修改authorization.service与04的状态/删除用例、05的注册事务；新增管理员并发测试。
- 操作：管理员定义为ACTIVE/未删除且关联enabled系统admin角色的用户。禁止当前操作者禁用/删除自己；任何导致最后管理员失效的状态/删除/角色变更返回409。两管理员并发互相移除等竞争必须在一致锁顺序或Serializable事务里重新计数并写入，冲突有限重试；不能在事务外count一次。
- 调用上下文：Controller通过05的CurrentUser取actorUserId并作为显式参数传给状态/删除/批量/关联用例；不得从请求body接受操作者身份，也不让Repository反向依赖HTTP request。
- 失效：角色权限/用户角色改动事务内递增受影响User.permissionVersion，回滚则版本不变；初期Guard仍每请求查表，所以即使无Redis也立即撤权。07默认不缓存权限；以后若缓存须把版本校验权威放在DB或明确批准撤权窗口，不能只依赖最佳努力DEL。
- 审计：暂保留结构化安全事件，08后权限变更和审计记录同tx落库；不能把凭据塞进审计快照。
- 命令：两会话测试撤权前200、提交后下一次403；并发操作最后管理员测试只允许保留至少一个有效管理员。
- 预期/验证：新权限不需刷新JWT即可获得/失去；管理员保护不被软删或批量操作绕过。

## 6. 数据库设计

当前已有 Role、UserRole 和 User.roles；Role 使用数字 status 并有 sort，UserRole 使用自增 id 加 userId/roleId 联合唯一、级联删除。下方为目标，尚无 Permission/RolePermission、enabled/isSystem 和授权模块；不能整体覆盖当前 Schema。缩短 code 长度、status→enabled、主键替换、级联→Restrict 均需评估存量数据、依赖及迁移成本，先与 02 和 ADR0004 明确方案；不为目录整理改变这些约束。

目标角色/权限采用 Int 自增 PK、code 唯一；关联表复合 PK 防重复，反向索引支持“角色有哪些用户/权限有哪些角色”。Restrict 防误删已关联实体；解除关联为显式事务操作。现有关系可在评估后保留等价唯一约束，具体增量方案验收前回填。

```prisma
model Role {
  id          Int              @id @default(autoincrement())
  code        String           @unique @db.VarChar(32)
  name        String           @db.VarChar(64)
  description String?          @db.VarChar(255)
  enabled     Boolean          @default(true)
  isSystem    Boolean          @default(false) @map("is_system")
  users       UserRole[]
  permissions RolePermission[]
  createdAt   DateTime         @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime         @updatedAt @map("updated_at") @db.DateTime(3)
  @@map("roles")
}
model Permission {
  id    Int              @id @default(autoincrement())
  code  String           @unique @db.VarChar(64)
  name  String           @db.VarChar(64)
  roles RolePermission[]
  @@map("permissions")
}
model UserRole {
  userId Int  @map("user_id")
  roleId Int  @map("role_id")
  user   User @relation(fields: [userId], references: [id], onDelete: Restrict)
  role   Role @relation(fields: [roleId], references: [id], onDelete: Restrict)
  @@id([userId, roleId])
  @@index([roleId, userId])
  @@map("user_roles")
}
model RolePermission {
  roleId       Int        @map("role_id")
  permissionId Int        @map("permission_id")
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Restrict)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Restrict)
  @@id([roleId, permissionId])
  @@index([permissionId, roleId])
  @@map("role_permissions")
}
```

本阶段新增迁移，不修改02已应用SQL；种子独立显式执行，migrate deploy不会自动替你完成seed。生产回滚优先保留新增表并回应用，不能删权限历史恢复旧角色enum。

## 7. API 设计

当前角色资源接口已实现创建、分页列表、详情、更新和未分配删除，未统一包装、无认证/权限 Guard。公开字段为 id/name/code/description/status/sort/createdAt/updatedAt。创建/更新 DTO 见第 5.3.1 节，查询 DTO 见第 5.3.2 节。实际数据库及 HTTP 行为尚未验收。

以下认证、权限、`enabled/isSystem` 与 `data:null` 删除体为完整 RBAC 的目标契约，不代表当前已实现。

前缀/api/v1，均要求Access；Role公开字段为id/code/name/description/enabled/isSystem/createdAt/updatedAt，Permission为id/code/name。返回按03包装。所有接口还可能503依赖不可用。

| 接口名称 | Method/URL | 请求 | data | 正常码 | 异常码 | 权限 |
| --- | --- | --- | --- | --- | --- | --- |
| 角色列表/详情 | GET /roles、/roles/:id | 分页/id | Page<Role>/Role | 200 | 400/401/403/404 | roles:read |
| 新建角色 | POST /roles | code/name/description? | Role | 201 | 400/401/403/409 | roles:write |
| 修改角色 | PATCH /roles/:id | name?/description?/enabled? | Role | 200 | 400/401/403/404/409 | roles:write |
| 删除未分配角色 | DELETE /roles/:id | id | null | 200 | 400/401/403/404/409 | roles:write |
| 权限目录 | GET /permissions | 分页/code? | Page<Permission> | 200 | 400/401/403 | permissions:read |
| 角色权限详情 | GET /roles/:id/permissions | id | Permission[] | 200 | 400/401/403/404 | roles:read |
| 替换角色权限 | PUT /roles/:id/permissions | permissionIds:Int[] | Permission[] | 200 | 400/401/403/404/409 | roles:write+授予范围校验 |
| 用户角色详情 | GET /users/:id/roles | id | Role[] | 200 | 400/401/403/404 | users:assign-roles |
| 替换用户角色 | PUT /users/:id/roles | roleIds:Int[] | Role[] | 200 | 400/401/403/404/409 | users:assign-roles+授予范围校验 |

```bash
curl -i http://localhost:3000/api/v1/roles -H "Authorization: Bearer $ACCESS_TOKEN"
curl -i -X PUT http://localhost:3000/api/v1/users/2/roles -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' --data '{"roleIds":[]}'
```

第二例仅在隔离测试fixture上以有权且满足管理员保护的操作者执行；普通member应403。权限目录无HTTP写入口，新增code走版本化种子和审阅。

## 8. 验收标准

- [ ] 种子幂等，无默认管理员密码，bootstrap不静默提权。
- [ ] 401/403/无元数据默认拒绝/仅认证/多权限AND测试通过。
- [ ] 角色/权限/关联CRUD、唯一约束和全量替换原子性通过。
- [ ] 撤权下一请求立即403；授权不依赖JWT中的旧role。
- [ ] 系统角色/自修改/最后管理员保护覆盖单条和批量以及并发场景。

完整 RBAC 验收：未执行。

2026-10-26 角色 DTO 局部检查：Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3；运行目录 `project/`。

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`：退出 0。
- `pnpm run build`：退出 0，使用已有本地依赖及生成客户端。
- `pnpm exec eslint src/modules/roles/dto/create-role.dto.ts src/modules/roles/dto/update-role.dto.ts --max-warnings=0`：退出 0。
- `pnpm exec prettier --check src/modules/roles/dto/create-role.dto.ts src/modules/roles/dto/update-role.dto.ts`：退出 0。

未新增或执行 Jest、DTO 运行时测试、HTTP、数据库、权限或 OpenAPI 生成验收；未读取真实环境配置，未安装依赖、generate、迁移或部署。当前仅 DTO 已实现且静态检查通过，不将阶段 06 标为已实现或已验证。

同日后续 QueryRoleDto 局部检查：环境及运行目录同上，以下命令均退出 0：

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`
- `pnpm run build`
- `pnpm exec eslint src/modules/roles/dto/query-role.dto.ts --max-warnings=0`
- `pnpm exec prettier --check src/modules/roles/dto/query-role.dto.ts`

仅上述静态检查与构建已验证；列表 Controller/Service 尚未接入查询 DTO，未执行测试或数据库操作。记录合并至 [CHG-20261026-001](../changelog/2026-10-26-001-role-dto-validation.md)。

同日后续创建角色局部检查：环境同上。运行目录 `/private/tmp`，执行已安装的 `project/node_modules/.bin/prisma generate --schema <仓库绝对路径>/project/prisma/schema.prisma`，退出 0，生成 Prisma Client 7.10.1（含 Role/UserRole）；未加载项目配置或个人环境文件。生成目录仍忽略入库。

运行目录 `project/`：

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`：退出 0。
- `pnpm run build`：退出 0。
- `pnpm exec prettier --check src/modules/roles/roles.service.ts src/modules/roles/roles.module.ts`：退出 0。
- `pnpm exec eslint src/modules/roles/roles.service.ts src/modules/roles/roles.module.ts --max-warnings=0`：退出 1，仅剩原有 updateRoleDto 未使用；修改前同范围有 createRoleDto/updateRoleDto 两处未使用错误。未更改无关 update 占位逻辑或关闭规则。

未执行 Jest、HTTP、真实数据库连通/写入/并发、迁移或部署。创建代码已实现，运行与数据库行为未验证，完整 RBAC 仍计划中。

2026-10-30 角色资源 CRUD 局部检查：Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3；运行目录 `project/`。以下命令均退出 0：

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`
- `pnpm run build`（使用已有本地生成客户端）
- `pnpm exec eslint src/modules/roles --max-warnings=0`
- `pnpm exec prettier --check src/modules/roles`
- 仓库根目录 `git diff --check`

未执行 Jest、HTTP、数据库连接/写入、迁移、generate 或部署。角色资源 CRUD 代码已实现，运行与数据库行为未验证，不将阶段 06 标为已实现或已验证。证据见 [CHG-20261030-001](../changelog/2026-10-30-001-role-resource-crud.md)。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| 无req.user却进权限Guard | 全局Guard顺序不可靠，集中注册或组合调用 |
| 只在前端隐藏按钮 | HTTP仍可直接访问，必须Guard+Service约束 |
| 改权限需要重新登录 | Guard错误使用JWT快照，切换权威DB读取 |
| 最后管理员仍可被删 | 事务外计数/批量路径漏保护/隔离级别不足 |

## 10. 后续扩展

[07](../07-redis/implementation.md)不缓存权限事实；08将授权管理事件写入不可随意改写的审计记录。数据范围、多租户、ABAC和委托授权只在实际需求出现后扩展，不能以一个角色Guard代替所有对象级权限。
