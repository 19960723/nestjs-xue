# 阶段 08：公共基础能力

更新：2026-10-21。文档状态：已编写；功能状态：计划中。前置：[02](../02-database/implementation.md)～[07](../07-redis/implementation.md)。本阶段增强01/03已有基础，优先修改原配置/日志入口，不创建第二套系统。

## 1. 阶段目标

完善配置/日志、探针、文件安全、定时任务和事务审计。文件功能属于推荐能力，未启用时可延后，但审计、就绪检查和已启用功能的安全验收属于对外发布门槛。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| 配置/结构化日志 | 单一配置来源与可查询日志 | P0 | 01/03 | 配置校验、JSON/脱敏/trace一致 |
| 存活/就绪检查 | 避免依赖故障无限重启 | P0 | DB/Redis策略 | live与ready可分别验证 |
| 审计/事务 | 追踪敏感变更与数据一致性 | P0 | 认证/RBAC | 关键写和审计同tx，无凭据入库 |
| 文件上传/下载 | 可控文件边界 | P1 | Auth/RBAC | 大小/真实类型/归属/路径均验证 |
| 定时清理 | 限制过期数据增长 | P1 | session/bucket/file | 幂等、批次、单调度器 |
| API版本 | 可兼容演进 | P0 | 01 URI版本 | v1稳定，破坏性变更另开版本 |

## 3. 技术原理

配置校验只发生一次，业务通过ConfigService获取已验证值；03的AsyncLocalStorage携带requestId，日志写stdout而非容器本地无限文件。审计关注“谁在何时对什么做了什么”，请求日志关注耗时/状态；二者不能互相替代。

事务由业务Service决定，AuditService接收同一个Prisma.TransactionClient。上传文件和数据库不是同一事务：采用临时隔离文件→验证→持久化→写元数据，失败补偿删除，多余文件由幂等任务清理。参考 [Nest文件上传](https://docs.nestjs.com/techniques/file-upload)、[定时任务](https://docs.nestjs.com/techniques/task-scheduling)、[版本](https://docs.nestjs.com/techniques/versioning)。

## 4. 实现前准备

schedule已核实12.0.2，后续手动 `pnpm add --save-exact @nestjs/schedule@12.0.2`。Express平台已安装，Multer拦截器从现有@nestjs/platform-express使用；只有直接引用multer API时才把它列为直接依赖。新辅助包如 `@types/multer`、`file-type`（文件魔数）、`helmet` 先 `pnpm view 包 version engines peerDependencies --json`，确认Node24/ESM兼容后精确安装并更新版本表，不能伪称本次已核实补丁。

新增配置：UPLOAD_ENABLED=false、UPLOAD_MAX_BYTES=5242880、UPLOAD_ROOT（站点静态目录之外）、SCHEDULE_ENABLED=false、TRUSTED_PROXY、CORS_ORIGINS。审计保留期、存储位置、IP脱敏与备份周期按业务确认；默认示例不是法律/合规结论。

## 5. 详细实施步骤

### 5.1 整合配置、日志与HTTP安全边界

- 目标：单一配置/日志入口，支持生产查询。
- 文件：修改 `project/src/config/env.validation.ts`、03的request-context/logger、`project/src/main.ts`与bootstrap helper。
- 操作：把各模块配置键纳入分组校验但仍集中加载；新增依赖启用才必填，未知开关值失败。日志采用Nest当前版JSON logger或实现LoggerService输出一行JSON；字段time/level/context/requestId/event/duration/status，错误堆栈只在服务端脱敏记录，不自动序列化整个错误对象。维护03敏感字段规则。
- HTTP：Helmet安全头、精确CORS白名单、body JSON大小上限；JSON limit（如1mb）与multipart限额分别配置。信任代理限定已知地址/跳数并测试XFF，禁用x-powered-by；Cookie模式未启用时不擅自打开credentials跨域。
- 命令：`pnpm run build`与Jest日志/配置测试；curl检查安全头，发送伪造Origin/非法配置/大body。
- 预期/验证：JSON可逐行解析，400/403/413/500都有requestId；console临时调试与重复日志被清理；不新增额外日志框架仅为“企业级”。

### 5.2 分离存活与就绪检查

- 目标：上游知道何时可路由流量。
- 文件：修改 `project/src/modules/health/{health.controller,health.service,health.module}.ts`、Guard/节流排除规则。
- 操作：live只代表进程HTTP可响应；ready执行固定参数化 `SELECT 1` 和启用为必需的Redis PING，连接/命令都有1～2秒预算，不读取业务表、不返回地址/密码。所有必需依赖正常200，否则503；在终止时先标not ready再排空请求，10配置停止宽限期。
- 探针访问：live显式Public且排除节流；ready为内部网络探针可Public但网络受控、响应只有status，依赖细节只写内部日志；不因检查失败触发重启风暴。两者均按03包装。
- 命令：`curl -i http://localhost:3000/api/v1/health/live`和ready；在隔离环境注入DB/Redis超时。
- 预期/验证：依赖不可用时live200、ready503；Redis只作为可选缓存时不影响ready，作为必需共享限流时影响ready。探针实际超时受连接/查询设置约束，不只Promise.race后留下无限后台查询。

### 5.3 实现审计和跨表事务

- 目标：关键变更与其审计共成败。
- 文件：新增 `project/src/modules/audit/{audit.module,audit.service,audit.repository,audit.controller}.ts`；修改users/auth/authorization写用例及Schema。
- 操作：成功的用户状态、软删、角色关联、权限、密码重置/改密/退出事件写AuditLog，只保存字段名/脱敏摘要；密码/hash/token不入before/after。AuditService接受tx，业务失败同tx审计也回滚；未认证失败/拒绝事件记录安全日志或独立审计事务，不能伪装成已成功变更。

```ts
await prisma.$transaction(async (tx) => {
  // 业务Repository必须接收tx，不能用外部client另开写入
  await usersRepository.disable(tx, userId);
  await auditService.record(tx, {
    actorUserId, action: 'users.disable', targetType: 'user',
    targetId: String(userId), requestId,
  });
});
```

- 命令：`migrate dev --name add_audit_files --create-only`（通过pnpm exec prisma调用），审阅后应用并generate；测试审计插入失败整个业务回滚。
- 预期/验证：每次关键写有对应actor/target/requestId，日志无凭据；不提供改写/删除审计的HTTP接口。生产可为audit_logs授予runtime只SELECT/INSERT，其余表按需DML；保留清理由独立维护账户执行。

### 5.4 实现文件上传、存储与读取

- 目标：内容、容量和对象归属均受限。
- 文件：新建 `project/src/modules/files/{files.module,files.controller,files.service,file-storage.service}.ts`及DTO/验证器，新增StoredFile模型。
- 操作：仅允许认证用户+files:upload上传单个名为file的multipart字段，最多5MiB、1个文件，限制parts/fields；Multer先限制总字节、写隔离临时目录，再检查真实魔数只收PNG/JPEG，拒绝SVG/HTML/脚本/扩展名伪装，不相信mime header。使用检测器校验图片格式，若产品需要头像再加可信解码器重编码/尺寸/像素上限，未完成就不称完整图像处理安全。
- 存储：服务器生成随机storageKey，不接纳原始文件路径/文件名；临时/最终目录不在静态webroot，禁止执行，限定路径在UPLOAD_ROOT之内；不从URL任意抓取文件。校验通过后移动到持久目录，DB保存元数据；DB失败补偿删除文件，清理任务按key扫描孤儿。若对象存储，storageKey替代本地路径，权限和签名URL期限另定。
- 下载：读取StoredFile后检查owner或明确管理权限，文件不存在/已删404；返回安全Content-Type、attachment和nosniff，不回传物理路径；下载流SkipEnvelope并在OpenAPI声明binary。上传元数据返回标准包装；非法文件/格式400、超大小413、无权403。
- 命令：隔离服务 `curl -i -X POST http://localhost:3000/api/v1/files -H "Authorization: Bearer $ACCESS_TOKEN" -F 'file=@/绝对路径/test.png'`；构造超限/伪扩展/路径名、无主/别人的file id测试。
- 预期/验证：拒绝文件无临时残留；别人的id不泄漏内容；容器只读根目录时上传使用独立可写卷，不把文件放dist或容器临时层。

### 5.5 增加幂等清理任务与版本策略

- 目标：清理可控、不多副本重复/误删。
- 文件：新建 `project/src/modules/maintenance/maintenance.module.ts`、`cleanup.service.ts`；修改模块开关和部署角色。
- 操作：注册ScheduleModule，@Cron任务按UTC运行；SCHEDULE_ENABLED默认false，单独调度器实例启用。按索引游标每批<=500删除到期桶、过保留期reset token和已绝对过期session的Refresh子表/父表；不删除仍需重放检测的旧Refresh记录，不清理未过期session。过程幂等、限时，记录数量/耗时/失败，可中断续跑。
- 多副本：优先一个调度器；若需分布式锁，SET NX PX随机owner+校验owner释放，并设计租约续期/超时后幂等，不能假定拿到一次锁就永不重入。Redis故障时跳过任务报警。
- 版本：复用01 URI v1；破坏性契约加v2并安排兼容期，不在本阶段仅为展示复制全套v2代码。
- 命令：使用测试时钟调用单次cleanup，重复调用不改变有效数据；调度器关闭时检查不运行；类型/构建/对应测试通过。
- 预期/验证：过期数据按策略清理，仍有效的token和业务资料不误删，API v1保持稳定。

## 6. 数据库设计

给User增加 `files StoredFile[]`；AuditLog.actorUserId是可空关联，User增加 `auditLogs AuditLog[]`。Int PK/日期延续既定基线；审计不直接保存完整请求对象。Json只存限定的可序列化安全字段。

```prisma
model StoredFile {
  id           String    @id @default(uuid()) @db.VarChar(36)
  ownerId      Int       @map("owner_id")
  owner        User      @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  storageKey   String    @unique @map("storage_key") @db.VarChar(255)
  originalName String    @map("original_name") @db.VarChar(255)
  mimeType     String    @map("mime_type") @db.VarChar(100)
  sizeBytes    Int       @map("size_bytes")
  deletedAt    DateTime? @map("deleted_at") @db.DateTime(3)
  createdAt    DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  @@index([ownerId, deletedAt, createdAt])
  @@map("stored_files")
}
model AuditLog {
  id          Int      @id @default(autoincrement())
  actorUserId Int?     @map("actor_user_id")
  actor       User?    @relation(fields: [actorUserId], references: [id], onDelete: Restrict)
  action      String   @db.VarChar(64)
  targetType  String   @map("target_type") @db.VarChar(32)
  targetId    String   @map("target_id") @db.VarChar(64)
  requestId   String   @map("request_id") @db.VarChar(64)
  details     Json?
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)
  @@index([actorUserId, createdAt])
  @@index([targetType, targetId, createdAt])
  @@index([createdAt])
  @@map("audit_logs")
}
```

originalName仅作为经长度/控制字符过滤的元数据，不用于路径，下载默认使用安全服务端名称。运行时应用不得随意UPDATE/DELETE审计；归档/保留策略由维护角色执行。迁移保持追加，生产回滚保留新增表；如不用文件功能，可将文件迁移与审计分开生成，不提前创建无用途表。

## 7. API 设计

路径前缀/api/v1，除下载外按03包装。

| 接口名称 | Method/URL | 请求 | 返回data | 正常码 | 异常码 | 认证/权限 |
| --- | --- | --- | --- | --- | --- | --- |
| 存活 | GET /health/live | 无 | status:ok | 200 | 500 | Public/不节流 |
| 就绪 | GET /health/ready | 无 | status:ok/unavailable | 200 | 503 | 内部探针/仅简要状态 |
| 上传 | POST /files | multipart file | id/mimeType/sizeBytes/createdAt | 201 | 400/401/403/413/429/503 | JWT/files:upload |
| 下载 | GET /files/:id/content | UUID | 原始文件流 | 200 | 400/401/403/404/429/503 | JWT/files:read+owner检查 |
| 审计列表 | GET /audit-logs | 分页/action?/actorId?/起止时间 | Page<脱敏Audit> | 200 | 400/401/403/429/503 | JWT/audit:read |

示例：`curl -i http://localhost:3000/api/v1/health/ready`；`curl -i http://localhost:3000/api/v1/audit-logs -H "Authorization: Bearer $ACCESS_TOKEN"`。上传测试使用5.4的multipart示例，必须用隔离测试文件和本地真实路径替换示意路径。

## 8. 验收标准

- [ ] 配置/日志只有一套入口，日志JSON可解析、敏感字段被过滤。
- [ ] live/ready对DB/Redis故障、超时、关闭阶段返回符合规范。
- [ ] 关键写+审计同事务，失败完整回滚，拒绝事件另外记录。
- [ ] 若启用文件：大小/真实类型/路径/对象权限/补偿/流响应测试通过。
- [ ] 清理幂等、有批次/索引/保留策略，多实例不重复执行。
- [ ] OpenAPI、权限种子与数据库迁移同步更新。

验收记录：未执行；文件存储与审计保留周期待业务确认。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| API失败但审计成功写“已操作” | 审计用了外层client或过滤器猜测业务结果 |
| 容器重启丢文件 | 写在临时层，改持久卷/对象存储并验证备份 |
| health导致实例频繁重启 | 将readiness依赖故障当liveness失败 |
| 多副本重复清理 | 单调度器开关未隔离或锁租约/幂等不完整 |
| 图片mime正确仍有风险 | header不可信，补魔数、真实解码、像素上限和安全下载 |

## 10. 后续扩展

[09](../09-testing/implementation.md)将故障/安全/事务场景纳入CI；[10](../10-deployment/implementation.md)部署探针、日志轮转和持久卷。对象存储、内容扫描、集中日志平台、OpenTelemetry在明确运维需求后增加，不默认启用外部遥测服务。
