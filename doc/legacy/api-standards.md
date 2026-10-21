> 历史归档（2026-10-21），原位置：`doc/03-接口规范.md`。以下保留旧方案用于追溯，其中版本、阶段、状态与代码示例可能过时；当前实施请从 [文档导航](../README.md) 开始。

# 第三阶段：接口规范与数据校验

目标：入参自动校验，出参格式统一，错误集中处理，日志能看到请求耗时。

上一阶段：CRUD 能跑，但缺字段不会自动 400，成功和失败的 JSON 形状也不统一。

## 要搞懂什么

| 概念 | 时机 | 典型用途 |
| --- | --- | --- |
| Pipe | 进入 Controller 前 | 校验、转换参数 |
| Guard | Pipe 之前 | 认证、权限（第四阶段） |
| Interceptor | 方法前后 | 包装响应、打日志 |
| Exception Filter | 抛错时 | 统一错误 JSON |

请求生命周期（简化）：

```text
请求 → Guard → Pipe → Controller → Service
                ↓ 成功
           Interceptor 包装 { code, message, data }
                ↓ 抛错
           Exception Filter 返回 { code, message, data: null }
```

---

## 步骤 1：DTO 参数校验

### 目的

用装饰器声明规则，少写 `if (!dto.email)`。

### 安装

```bash
pnpm add class-validator class-transformer
```

- `class-validator`：`@IsEmail()` 这类规则
- `class-transformer`：把普通 JSON 变成 DTO 类实例，校验才能生效；也能把 `"1"` 转成 `1`

### 改 CreateUserDto

`src/users/dto/create-user.dto.ts`：

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'tom', description: '用户名，3-32 位' })
  @IsString()
  @Length(3, 32)
  username: string;

  @ApiProperty({ example: 'tom@test.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 64)
  password: string;

  @ApiPropertyOptional({ example: '汤姆' })
  @IsOptional()
  @IsString()
  nickname?: string;
}
```

要点：

- 必须是 **class**，不能是 `interface`。装饰器只能挂在类上。
- `@IsOptional()` 要写在其它规则前面：字段可缺省，一旦传了仍要满足 `@IsString()`。
- `@ApiProperty` 只影响 Swagger 展示，不负责校验。

### 分页 Query DTO

query 都是字符串，要用 `@Type(() => Number)`：

```ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class QueryUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
```

`pageSize` 上限 100，防止 `pageSize=999999` 把数据库打满。

### 批量删除 DTO

```ts
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class BatchDeleteUserDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}
```

`each: true` 表示数组里每一项都是整数。

---

## 步骤 2：全局 ValidationPipe

### 目的

每个接口自动校验，不用逐个加 `@UsePipes`。

### 在 `main.ts` 里

```ts
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
);
```

| 选项 | 作用 |
| --- | --- |
| `whitelist` | 去掉 DTO 上没声明的字段，防止传入 `role: ADMIN` 被写进库 |
| `forbidNonWhitelisted` | 多传未知字段直接 400，而不是悄悄丢掉 |
| `transform` | 把 payload 变成 DTO 实例，query 才能转 number |

### 验收

```bash
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"ab","email":"not-email","password":"1"}'
```

应 400，body 里能看到 username / email / password 的错误信息。

多传 `"hack": true` 也应 400。

---

## 步骤 3：统一响应格式

### 目的

前端只对接一种形状：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

分页：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "pageSize": 10
  }
}
```

### 实现拦截器

`src/common/interceptors/transform.interceptor.ts`：

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data: data ?? null,
      })),
    );
  }
}
```

`main.ts`：

```ts
app.useGlobalInterceptors(new TransformInterceptor());
```

Controller 仍然 `return user`，不用每次手写 `{ code: 0, ... }`。

### 复习：Interceptor 和中间件的差别

中间件是 Express 层，拿不到 Controller 返回值。Interceptor 包在 Nest 方法外，用 RxJS `map` 改返回值，正好用来统一包装。

---

## 步骤 4：全局异常处理

### 目的

成功走拦截器，失败走过滤器，JSON 形状保持一致。

`src/common/filters/http-exception.filter.ts`：

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response, Request } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = status;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status;
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : Array.isArray((res as { message?: string | string[] }).message)
            ? ((res as { message: string[] }).message.join('; '))
            : ((res as { message?: string }).message ?? exception.message);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = status;
        message = '用户名或邮箱已存在';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = status;
        message = '记录不存在';
      }
    }

    this.logger.error(
      `${request.method} ${request.url} ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      code,
      message,
      data: null,
    });
  }
}
```

`main.ts`：

```ts
app.useGlobalFilters(new AllExceptionsFilter());
```

`@Catch()` 不传参数表示捕获所有异常。只捕 HTTP 异常可写成 `@Catch(HttpException)`，那样 Prisma 错误会变成未处理的 500。

ValidationPipe 失败时 `message` 往往是字符串数组，上面用 `join` 方便阅读。

---

## 步骤 5：HTTP 状态码规范

| 场景 | 抛什么 | HTTP |
| --- | --- | --- |
| DTO 校验失败 | ValidationPipe 自动 | 400 |
| 未登录 / token 无效 | `UnauthorizedException` | 401 |
| 登录了但角色不够 | `ForbiddenException` | 403 |
| 用户不存在 | `NotFoundException` | 404 |
| 用户名、邮箱重复 | `ConflictException` 或 Prisma `P2002` | 409 |
| 未预料错误 | 过滤器兜底 | 500 |

成功：

- 查询、更新：200
- 创建：可以用 `@HttpCode(201)`，学习阶段统一 200 也可以
- 删除：200 + `{ id }` 或 204 无 body；若用 204，拦截器不要再包一层 JSON

**HTTP status 和业务 `code`：** 本项目让 `code` 等于 HTTP status（成功用 `0`）。前端以 `code === 0` 判断成功即可。

不要用 200 装失败（例如 `{ code: 404 }` 但 HTTP 仍 200），否则浏览器和网关不好做监控。

---

## 步骤 6：请求日志

`src/common/interceptors/logging.interceptor.ts`：

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.log(`${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
        },
        error: () => {
          const ms = Date.now() - start;
          this.logger.warn(`${req.method} ${req.url} failed ${ms}ms`);
        },
      }),
    );
  }
}
```

注册顺序：先日志、再包装，或反过来都可以。建议：

```ts
app.useGlobalInterceptors(
  new LoggingInterceptor(),
  new TransformInterceptor(),
);
```

异常细节以 Filter 里的 `logger.error` 为准，Interceptor 只记耗时。

生产环境不要把 body 里的密码打进日志。需要记 body 时对 `password` 做脱敏。

---

## 步骤 7：数据转换

### 时间

Prisma 返回 `Date`，`JSON.stringify` 会变成 ISO 字符串，例如 `2026-10-21T03:00:00.000Z`。一般够用。若要 `YYYY-MM-DD HH:mm:ss`，在拦截器里递归格式化，或在 `select` 后自己 map。

### 分页

Service 固定返回 `{ list, total, page, pageSize }`，拦截器不要再拆。前端永远从 `data.list` 取数组。

### 敏感字段

三层都做，不依赖其中一层：

1. 查询 `select` 不含 `password`
2. `ValidationPipe.whitelist` 防止传入多余字段改角色
3. 需要时在拦截器删除 `password`

### 空值

`data: data ?? null`，避免成功时 `data: undefined` 导致字段消失。

---

## `main.ts` 本阶段完成后的样子

```ts
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NestJS 学习项目')
    .setDescription('用户管理与认证 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`应用: http://localhost:${port}/api`);
  logger.log(`文档: http://localhost:${port}/api/docs`);
}
await bootstrap();
```

也可以把 Pipe / Filter / Interceptor 放到 `AppModule.providers` 里用 `APP_PIPE`、`APP_FILTER`、`APP_INTERCEPTOR` 注册，便于测试时替换。学习阶段写在 `main.ts` 更直观。

---

## 第三阶段总验收

- [ ] 邮箱格式错误、缺必填 → 400，响应是 `{ code, message, data: null }`
- [ ] 多传未知字段 → 400
- [ ] 创建成功 → `{ code: 0, message: "ok", data: { ...用户 } }`
- [ ] 重复邮箱 → 409
- [ ] 不存在的 id → 404
- [ ] 控制台能看到 `GET /api/users 200 12ms` 这类日志
- [ ] 响应中仍然没有 `password`

做完后进入 [04-认证权限.md](authentication-authorization.md)。
