# 阶段 03：基础接口规范

更新：2026-10-21。文档状态：已编写；功能状态：计划中。前置：[01](../01-initialization/implementation.md)、[02](../02-database/implementation.md)。命令默认在project/，尚未执行。

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

已核实可兼容版本，后续手动安装：

```bash
pnpm add --save-exact class-validator@0.15.1 class-transformer@0.5.1 @nestjs/swagger@12.0.2
```

前置：02生成的Prisma错误类型、01的health/Jest骨架/URI版本；新增 `SWAGGER_ENABLED=false`（开发可true）、`CORS_ORIGINS`，纳入配置校验。生产Swagger默认关闭；工具路由不会自动经过Controller的JWT Guard，不能以addBearerAuth替代对Swagger本身的访问控制。

## 5. 详细实施步骤

### 5.1 固定路由与DTO

- 目标：所有业务路径统一 `/api/v1`，校验发生在进入Service之前。
- 文件：修改 `project/src/main.ts`；新建 `project/src/common/dto/pagination-query.dto.ts`，测试夹具 `project/test/api-standards.e2e-spec.ts`。
- 操作：保留01前缀/URI版本；在应用初始化函数注册ValidationPipe，使main与E2E复用同一配置。

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
- 文件：新建 `project/src/config/swagger.ts`；修改bootstrap、DTO/Controller装饰器；新增OpenAPI测试。
- 操作：DocumentBuilder标题/版本/addBearerAuth；SwaggerModule.createDocument生成，setup显式路径`api/docs`并设置`jsonDocumentUrl: 'api/openapi.json'`。所有端点标注正常码/异常码、请求DTO与响应schema；泛型统一包装/分页用ApiExtraModels+getSchemaPath显式建schema，不假定泛型被反射。
- 命令：开发 `SWAGGER_ENABLED=true pnpm start:dev`，`curl -i http://localhost:3000/api/openapi.json`；生产关闭后同路径404。
- 预期/验证：health在OpenAPI路径为/api/v1/health/live；业务POST正常201，login等显式200，reset202。Swagger原始JSON不经过响应包裹；UI Bearer按钮不等于接口已被保护。

## 6. 数据库设计

不新增表/迁移，只消费02的Prisma异常类型。排序不得把客户端字符串直接传为SQL字段；关联/事务异常的业务含义在Service决定，过滤器仅做最后安全边界。

## 7. API 设计

本阶段只修改已有health响应，测试夹具不对外发布。

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

验收记录：未执行。

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
