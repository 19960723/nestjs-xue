# 阶段 03：基础接口规范

更新：2026-10-23。文档状态：已更新；功能状态：进行中（现有接口 Swagger 装饰器已本地验证，其余规范未完成）。前置：[01](../01-initialization/implementation.md)、[02](../02-database/implementation.md)。命令默认在 project/；仅第 8 节本次验收记录列出的命令已执行，其余是后续实施示例。

## 1. 阶段目标

在业务接口前确定可校验、可观测的HTTP契约：REST、DTO、错误码、响应、分页、OpenAPI和请求标识。此文档是后续各阶段公共API约定的唯一入口。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| ValidationPipe/DTO | 拒绝非法输入 | P0 | validator/transformer | 类型/边界/未知字段测试通过 |
| 统一响应与异常 | 客户端契约稳定 | P0 | HTTP/Prisma错误 | 正常/异常都遵循共同结构 |
| REST/分页排序 | 保证一致访问行为 | P0 | 版本路由 | 参数上限和排序白名单有效 |
| Swagger | 可执行契约与调试 | P0 | DTO | UI/JSON与实际状态码一致 |
| Trace ID与日志 | 可关联失败请求 | P0 | 中间件 | Guard/Pipe异常也有ID和最终状态 |

## 3. 技术原理

请求大体经过middleware→guards→interceptors前半段→pipes→controller/service→interceptors响应→异常过滤。DTO必须是运行时class，不能用interface或type-only import消除它；参数数值转换要显式 `@Type(() => Number)`，不要全局隐式转换导致`"false"`变true。

响应包装拦截器只处理成功数据；全局异常过滤器同时处理Guard/Pipe/业务异常；请求ID在中间件最早生成。`res.finish`提供最终statusCode，不能只在拦截器开始时记录默认200。参考 [Nest校验](https://docs.nestjs.com/techniques/validation)、[过滤器](https://docs.nestjs.com/exception-filters)、[拦截器](https://docs.nestjs.com/interceptors)。

## 4. 实现前准备

当前 package 已声明 class-validator、class-transformer、@nestjs/swagger，无需为本次整理重复安装。以下保留精确版本安装示例，仅用于后续缺失依赖或单独依赖对齐任务；执行前按技术栈重新核对实际 package/锁文件与兼容边界，本次未安装：

```bash
pnpm add --save-exact class-validator@0.15.1 class-transformer@0.5.1 @nestjs/swagger@12.0.2
```

前置：02生成的Prisma错误类型、01的health/Jest骨架/URI版本；新增 `SWAGGER_ENABLED=false`（开发可true）、`CORS_ORIGINS`，纳入配置校验。生产Swagger默认关闭；工具路由不会自动经过Controller的JWT Guard，不能以addBearerAuth替代对Swagger本身的访问控制。

## 5. 详细实施步骤

### 本次实施范围（2026-10-23）

用户已明确授权为现有模块添加 Swagger 装饰器。当前实际代码已接入 Swagger 和 ValidationPipe；本次覆盖 App、Health、Users 三个 HTTP 控制器的全部 7 个操作，补充分组、摘要、参数、输入字段、成功响应和已实现业务异常。Prisma 是内部服务，没有 HTTP 路由；Role 只有数据模型，没有控制器。

以现有行为生成文档：根入口返回 text/plain；health 返回 `{status:"ok"}`；用户直接返回记录、列表 `{list,total,page,pageSize}` 或删除消息，尚未采用下述目标统一包装。当前未实现认证 Guard，不声明 Bearer 必需或 401/403；ID 仍由 `+id` 转换，Swagger 装饰器任务未改变校验或运行行为。Swagger 启动开关当前为 `SWAGGER_ENABLE`、路径键为 `SWAGGER_PATH`（默认 UI `/api/docs`，默认 JSON `/api/docs-json`），下文 `SWAGGER_ENABLED` 与 `/api/openapi.json` 是后续目标，尚未落实。该次 Swagger 任务未修改启动配置、连接数据库或安装依赖。

实施顺序：先记录当前契约，再补充显式 DTO/响应 schema 与控制器装饰器，最后在隔离测试模块中生成 OpenAPI 并核对路径、响应、字段和 PartialType 继承。沿用已有 Swagger CLI 插件；装饰器本身也应支持不经过插件的 tsc/Jest 编译。参考 [Nest 装饰器](https://docs.nestjs.com/openapi/decorators)、[类型与参数](https://docs.nestjs.com/openapi/types-and-parameters)。剩余阶段目标仍按下文推进。

同日按用户后续要求，删除本次新增的 `project/src/bootstrap/swagger.spec.ts`，暂不推进或运行测试；保留 Swagger 装饰器及响应模型，既有测试配置和其他测试文件不变。

### 5.1 固定路由与DTO

- 目标：所有业务路径统一 `/api/v1`，校验发生在进入Service之前。
- 文件：更新已有 `project/src/bootstrap/configure-app.ts`、`project/src/main.ts`；后续按需新建 `project/src/common/dto/pagination-query.dto.ts`，测试夹具 `project/test/api-standards.e2e-spec.ts`（测试执行暂缓）。
- 当前进度：整理期间的并行代码修改已把现有 Pipe 移入 configureApp，并移除 main 中的重复注册；main 与现有 E2E 均调用该函数。此项仅静态确认“已实现、未复验”，阶段 03 整体仍进行中；本次代理只修改文档。
- 操作：保留共用 Pipe 和前缀/URI 版本，后续补齐下方校验规则。测试恢复后分别验证 HTTP 校验及未知字段处理，不以移动代码证明行为已通过。
- 分批：先移动现有规则并保持分页默认 1/10、响应字段 list 及现有删除响应；下方更严格的校验、公共分页默认 1/20、items 和包装契约属于后续行为变更，须同步 DTO/Swagger/调用示例并独立记录。

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  validationError: { target: false, value: false },
}));
```

```ts
export class PaginationQueryDto {
  @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 20;
}
```

- 解释：分别从class-transformer、class-validator导入这些装饰器；Controller参数类需运行时导入。ID用 `ParseIntPipe`再校验正整数及Int上限；字符串数组/对象用嵌套DTO加ValidateNested/Type。对null按字段规则处理，不默认 `@IsOptional` 就认为null不可接受。
- 命令：`pnpm run typecheck`、`pnpm test`；测试夹具只存在于测试模块，不新增生产调试路由。
- 预期/验证：page=0、小数、NaN、pageSize=101、额外字段都400；默认分页1/20，未知排序字段400。

### 5.2 成功响应与分页契约

- 目标：保持HTTP语义，不用HTTP200隐藏失败。
- 文件：新建 `project/src/common/interceptors/response.interceptor.ts`、`project/src/common/types/api-response.ts`；在公共HTTP模块通过APP_INTERCEPTOR注册。
- 操作：用RxJS `map`包装Controller返回；不重复包装已知的业务对象；HTTP响应由拦截器负责一次。业务Service只返回业务数据。所有删除统一200+data:null，避免204还写JSON。文件流/重定向/原始响应接口用明确的SkipEnvelope元数据跳过并独立写OpenAPI。

```json
{"code":"OK","message":"ok","data":{"items":[],"total":0,"page":1,"pageSize":20},"requestId":"生成的请求ID"}
```

- 分页：page>=1、pageSize 1..100；排序只允许明确字段，固定二级id排序防同时间随机顺序；offset分页默认按id desc。items与count使用相同where；需要一致快照时使用RepeatableRead事务，不宣称Promise.all是快照。大数据量再加cursor分页。
- 命令：`pnpm run build`、对应Jest响应测试。
- 预期/验证：成功/空列表/null均只包一层；时间为UTC ISO8601；Int保持number，未来BigInt要显式转string；任何错误仍返回真实非2xx。

### 5.3 全局异常过滤与数据库错误

- 目标：统一客户端错误，保留内部排错能力而不泄漏。
- 文件：新建 `project/src/common/filters/all-exceptions.filter.ts`、`project/src/common/types/error-code.ts`，APP_FILTER注册。
- 操作：catch unknown，优先处理HttpException，再收窄此版Prisma已知请求错误；只输出安全信息，未知异常固定500。不要直接JSON.stringify error、request、query或ConfigService。

| 场景 | HTTP | code | 处理 |
| --- | --- | --- | --- |
| DTO非法 | 400 | VALIDATION_ERROR | details只含字段/安全规则信息，不回显值 |
| 未登录/Token无效 | 401 | UNAUTHENTICATED | 不泄漏签名/账户状态 |
| 无权限 | 403 | FORBIDDEN | 不回显用户权限全集 |
| 不存在或已软删 | 404 | NOT_FOUND | 不泄漏已删除资源 |
| P2002唯一冲突 | 409 | CONFLICT | 安全提示，不回显SQL/原始target |
| P2003关联冲突 | 409 | CONFLICT | 依业务解释，不声称资源不存在 |
| P2025 | 404或409 | NOT_FOUND/CONFLICT | 普通更新404；并发条件失败由Service转换409 |
| 限流 | 429 | RATE_LIMITED | Retry-After |
| DB/必需Redis不可用 | 503 | SERVICE_UNAVAILABLE | 依赖失败不伪装401/409 |
| 未知异常 | 500 | INTERNAL_ERROR | 内部日志记录堆栈并脱敏 |

错误示例：`{"code":"VALIDATION_ERROR","message":"请求参数不合法","data":null,"requestId":"...","details":[{"field":"email","messages":["邮箱格式不合法"]}]}`。Prisma P2034仅在可安全重试的短事务用最多3次退避重试，最终409或503取决于上下文，不无限重试。
- 命令：`pnpm test`，测试中构造已知错误、普通Error和HttpException，不必真实破坏DB来测试映射。
- 预期/验证：验证失败的message可以是数组，能安全规范化；错误中无stack/SQL/密码；日志含同一requestId。

### 5.4 请求上下文与完成日志

- 目标：从请求开始到成功/失败/断连都有可关联记录。
- 文件：新建 `project/src/common/middleware/request-context.middleware.ts`、`project/src/common/request-context.service.ts`；公共模块注册Provider，bootstrap在路由前绑定middleware。
- 操作：Node AsyncLocalStorage保存requestId；仅接受匹配 `^[A-Za-z0-9_-]{1,64}$` 的单个 `X-Request-Id`，其他情况生成randomUUID。写响应头，响应/错误从同一上下文取ID。response finish记录method、路由模板或不含query的路径、status、duration、requestId；close且未finish记录客户端中断，防重复。
- 日志：不得输出Authorization、Cookie、Set-Cookie、密码、refresh/reset token、数据库URL、完整请求body；账户和email等按需脱敏。信任代理只针对已知代理，不直接信任任意X-Forwarded-For。
- 命令：curl带合法/过长/含非法符号ID分别请求health；发送未知路径和无权限测试夹具请求。
- 预期/验证：响应头/JSON/日志ID一致；400/401/404/500都有最终状态和一条完成日志。恶意ID无法注入换行日志。

### 5.5 发布开发OpenAPI契约

- 目标：DTO、错误响应、认证和分页在文档可见。
- 文件：当前 `project/src/bootstrap/configure-swagger.ts` 已从 main 提取并接线，后续完善配置与日志；更新 `config/env.validation.ts`、`.env.example`、main 和文档引用。不另建 config/swagger.ts；配置目录维护输入校验，bootstrap 维护应用接线。现有 DTO/Controller 装饰器保留，OpenAPI 测试恢复后再补。
- 当前进度：用户已实现 SWAGGER_ENABLE 显式布尔转换、缺省 false，以及 SWAGGER_PATH 非空字符串校验；configureSwagger 已在 main 调用。main 的重复文档地址日志已被用户注释，configureSwagger 内日志仅在开关启用时打印；本轮只静态确认，未运行开关行为验收。未运行工具路由/开关测试，不据此标记阶段完成。
- 操作：统一采用目标键 SWAGGER_ENABLED、SWAGGER_PATH；将开关显式解析为 boolean，未配置默认 false，路径非空且格式合法。将旧 SWAGGER_ENABLE 替换到所有读取处及示例，不允许旧值静默失效；同步启动环境后再移除旧键。并行修改已移除临时 console.log；后续日志使用同一已校验路径，仅启用时输出，已修正 swagger.path 与 SWAGGER_PATH 混用，保留同一配置来源。
- 契约分批：提取函数先保留当前 UI `/api/docs`、JSON `/api/docs-json`；显式切换目标 `jsonDocumentUrl: 'api/openapi.json'` 另作 API 契约变化，更新调用方与验证记录。配置调用放在 init/listen 之前；main 和需要验证工具路由的 HTTP 测试调用同一个 configureSwagger，关闭时不注册 UI/JSON。
- 目标文档：保留 DocumentBuilder 标题/版本/addBearerAuth 与现有 7 个操作装饰器；所有端点标注实际正常码/异常码、请求 DTO 与响应 schema。认证和统一包装未实现前不虚标受保护或已包装；泛型包装/分页落实时用 ApiExtraModels+getSchemaPath 显式建 schema。
- 命令：开发 `SWAGGER_ENABLED=true pnpm start:dev`，`curl -i http://localhost:3000/api/openapi.json`；生产关闭后同路径404。
- 预期/验证：health在OpenAPI路径为/api/v1/health/live；业务POST正常201，login等显式200，reset202。Swagger原始JSON不经过响应包裹；UI Bearer按钮不等于接口已被保护。

### 5.6 bootstrap 职责与启动日志整理（计划中）

2026-10-23 用户希望优化 bootstrap。当前该目录只有 configure-app.ts、configure-swagger.ts，它是应用初始化函数的目录，没有 Nest Module/Controller/Service；保留这两个文件即可。本节只补充实施方案，代码仍由用户修改，未进行新一轮代码或运行验收。

| 文件 | 当前职责 | 本轮调整边界 |
| --- | --- | --- |
| src/bootstrap/configure-app.ts | 前缀 api、URI v1、ValidationPipe | 保留 configureApp 名称和现有设置，main/E2E 继续复用；仅整理格式和注释，不新增 bootstrap.module 或更多路由/校验小文件 |
| src/bootstrap/configure-swagger.ts | 从 ConfigService 读取开关/路径并注册工具文档 | 使用 Environment 已规范化的 boolean/string，关闭时提前返回；不在这里重复提供默认值、再次解析环境或读取 process.env；配置缺失由既有校验边界暴露 |
| src/main.ts | 创建应用、调用初始化、关闭信号、listen、日志 | 保留入口和调用顺序，删除多余空行与废弃日志注释；监听成功后统一输出实际服务/文档地址 |
| src/config/env.validation.ts | 环境输入校验、布尔转换、路径默认值 | 继续作为默认值和转换的唯一来源，bootstrap 不再维护第二套默认值 |

具体实施顺序：

1. configureSwagger 读取已校验的 SWAGGER_ENABLE，关闭时返回 undefined，不注册 UI/JSON，不输出“已启用”日志。沿用当前键名，不在此批次同时切换成文档远期目标 SWAGGER_ENABLED。
2. 开启时读取已校验的 SWAGGER_PATH，保留现有 DocumentBuilder、Bearer 定义、UI/JSON 路由和 persistAuthorization 行为；将 doc_config 等局部变量统一 camelCase，不额外建常量文件或工具层。
3. 注册成功后返回一个含 uiPath 的元数据对象，例如类型为 `{ uiPath: string } | undefined`；类型定义和实现留在 configure-swagger.ts。仅为显示而确保路径前导斜杠唯一，实际注册路径保持当前约定；不在此批切换 JSON 地址或严格路径校验策略。
4. 移除 configureSwagger 中硬编码 localhost 的绝对地址日志；main 保存返回值，await app.listen(port, host) 成功后获取 app.getUrl()，仅在存在 Swagger 元数据时拼接 uiPath 输出文档地址。这样绑定失败不会提前打印文档可用地址，自定义 HOST/端口也与实际监听地址一致。显示地址不代表已通过浏览器或网络连通验收。
5. createAppModule 仍留在 app.module.ts，启动工厂/Observe 配置不混入这次两文件整理。E2E 的 HTTP 初始化继续复用 configureApp；需要验证 Swagger 路由时按阶段 09 调用同一 configureSwagger，当前不恢复或运行测试。

兼容边界：保持 /api/v1、分页与 DTO 行为、Swagger 默认关闭、默认 UI /api/docs 和 JSON /api/docs-json；日志时机和内部返回类型变化不改变 HTTP 契约。保留 ESM 相对 .js 导入，不新增依赖，不改变模块注册、生成器或数据库连接。

完成标准（本轮未执行）：代码与测试代码类型检查、构建、定向 ESLint/Prettier 通过；后续恢复验证时确认关闭不注册、开启路径一致、监听失败不输出成功地址。未运行的路由/数据库验收继续标注未验收。该批次为职责和日志收拢，不据此将阶段 03 或 09 标记整体完成。

## 6. 数据库设计

不新增表/迁移，只消费02的Prisma异常类型。排序不得把客户端字符串直接传为SQL字段；关联/事务异常的业务含义在Service决定，过滤器仅做最后安全边界。

## 7. API 设计

下表为阶段目标契约，当前 health 仍返回原始 `{status:"ok"}`，OpenAPI 默认 JSON 仍为 `/api/docs-json`；本次整理没有改变这些行为。存活与业务响应包装、JSON 地址切换应按第 5 节独立实施，测试夹具不对外发布。

| 接口名称 | Method | URL | 请求 | 返回 | 正常码 | 异常码 | 认证/权限 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 存活检查 | GET | /api/v1/health/live | 可选X-Request-Id | 成功包装data.status=ok | 200 | 500 | 公开 |
| Swagger UI | GET | /api/docs | 无 | HTML（原始） | 200 | 404/访问控制错误 | 仅显式启用环境可用 |
| OpenAPI JSON | GET | /api/openapi.json | 无 | OpenAPI JSON（原始） | 200 | 404/访问控制错误 | 同上 |

```bash
curl -i -H 'X-Request-Id: api-contract-01' http://localhost:3000/api/v1/health/live
curl -i http://localhost:3000/api/v1/no-such-resource
```

预期分别200和404，均有requestId。后续业务阶段定义各自端点，本节契约不再各自复制。

## 8. 验收标准

- [ ] DTO边界、嵌套对象、未知字段、显式数值转换测试通过。
- [ ] 200/201/202/400/401/403/404/409/429/500/503契约测试通过。
- [ ] 错误无敏感内容，Guard/Pipe失败也带requestId和正确日志。
- [ ] 分页排序有白名单/上限，health不重复包装。
- [ ] OpenAPI契约与实际响应一致，生产默认禁用工具路由。

删除测试文件前的局部验收记录（2026-10-23）：Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3、@nestjs/swagger 12.0.2，目录 `project/`。`pnpm run build`、`pnpm run typecheck`、`pnpm run test --runInBand` 均退出 0；4 个测试套件、31 项测试通过，其中新增 `src/bootstrap/swagger.spec.ts` 的 4 项 OpenAPI 契约测试。对本次变更的 8 个 TS 文件运行 ESLint 和 Prettier 检查均通过；仓库 `git diff --check` 通过。

另外使用构建后的 `dist/` 控制器在隔离 Nest 测试模块生成 OpenAPI，断言 7 个操作、创建必填字段、PATCH 继承、可空字段、日期字符串、分页响应和根入口 text/plain 均通过，覆盖用户已有 CLI 插件编译路径；未加载个人配置、未监听端口、未连接数据库。首次 `pnpm test -- --runInBand` 因多余 `--` 被 Jest 当成筛选条件而未找到测试；改用上述正确命令后通过。尚未执行真实 Swagger UI 浏览器验收、数据库业务测试或本阶段其余完整验收；以上不表示阶段 03/09 整体完成。随后按用户要求删除新增的 Swagger 测试文件；31 项通过为删除前的历史结果，不代表当前测试数量。本次删除仅做文件及差异检查，未重新运行测试。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| DTO没有触发校验 | 检查是否class、参数类型/运行时import、全局Pipe是否在E2E也注册 |
| query字符串未变数字 | transform不等于所有字段自动转换；补Type和IsInt |
| 请求失败却日志200 | 从res.finish读取最终status，不在请求开始读 |
| Guard错误没requestId | 中间件注册太晚/只在拦截器生成ID |
| Swagger显示内部原始User | 使用专用响应DTO/显式schema，禁止展示passwordHash |

## 10. 后续扩展

[04](../04-user-management/implementation.md)直接复用本契约，不再另造响应/分页格式；08再完善日志、审计与探针。OpenAPI diff作为09 CI门禁；需要流式协议时单独定契约。
