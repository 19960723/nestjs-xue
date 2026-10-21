> 历史归档（2026-10-21），原位置：`doc/02-用户CRUD.md`。以下保留旧方案用于追溯，其中版本、阶段、状态与代码示例可能过时；当前实施请从 [文档导航](../README.md) 开始。

# 第二阶段：用户管理 CRUD

目标：用 Controller / Service / Module 跑通用户的增删改查，学会 Prisma 常用 API。

上一阶段：Prisma 已连上，`users` 表已存在。

## 要搞懂什么

- **Module**：一块功能的盒子，声明「有哪些 Controller、Service，依赖哪些模块」。
- **Controller**：只处理 HTTP（路径、方法、取 body/query/param），不写 SQL。
- **Service**：写业务和数据库操作，可被多个 Controller 注入。
- **DTO**：接口入参的形状，这一阶段先当类型用，校验放第三阶段。

请求链路：

```text
HTTP → UsersController → UsersService → PrismaService → MySQL
```

---

## 步骤 0：生成模块骨架

```bash
npx nest g module users
npx nest g controller users --no-spec
npx nest g service users --no-spec
```

会得到：

```text
src/users/
  users.module.ts
  users.controller.ts
  users.service.ts
```

CLI 生成的 `import` 可能没有 `.js` 后缀，**立刻补上**，否则 ESM 运行报错。

生成后的 `users.module.ts` 应类似：

```ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

`AppModule` 要 `imports: [UsersModule]`。`nest g module` 一般会自动加，确认一下，import 路径同样要 `.js`。

`PrismaModule` 已是 `@Global()`，这里不用再 import。

---

## 步骤 1：新增用户 `POST /api/users`

### 目的

把一条用户写入 MySQL。

### DTO

`src/users/dto/create-user.dto.ts`：

```ts
export class CreateUserDto {
  username: string;
  email: string;
  password: string;
  nickname?: string;
}
```

第三阶段再加 `class-validator`。现在先保证结构清晰。

### Service

`src/users/users.service.ts`：

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';

const userPublicSelect = {
  id: true,
  username: true,
  email: true,
  nickname: true,
  status: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    await this.ensureUnique(dto.username, dto.email);

    return this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password: dto.password, // 第四阶段改为哈希
        nickname: dto.nickname,
      },
      select: userPublicSelect,
    });
  }

  private async ensureUnique(username?: string, email?: string, excludeId?: number) {
    if (!username && !email) return;

    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [
          username ? { username } : undefined,
          email ? { email } : undefined,
        ].filter(Boolean) as Prisma.UserWhereInput[],
        NOT: excludeId ? { id: excludeId } : undefined,
      },
    });

    if (exists) {
      throw new ConflictException('用户名或邮箱已存在');
    }
  }
}
```

`select` 故意不包含 `password`，响应里就不会泄漏。

### Controller

`src/users/users.controller.ts`（先写创建，后面步骤往同一个文件加）：

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { BatchDeleteUserDto } from './dto/batch-delete-user.dto.js';

@ApiTags('用户')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '新增用户' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

### 验收

```bash
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"tom","email":"tom@test.com","password":"123456","nickname":"汤姆"}'
```

MySQL 或 Prisma Studio 能看到新行。响应中没有 `password`。

---

## 步骤 2：用户列表 `GET /api/users`

列表和分页、搜索共用一个接口更自然。可以先写「查全部」，下一步再加 `skip/take`。

```ts
findAll() {
  return this.prisma.user.findMany({
    select: userPublicSelect,
    orderBy: { id: 'desc' },
  });
}
```

Controller：

```ts
@Get()
@ApiOperation({ summary: '用户列表' })
findAll(@Query() query: QueryUserDto) {
  return this.usersService.findAll(query);
}
```

`findAll` 的完整实现见下一步，避免写两套查询。

---

## 步骤 3：分页查询

### 目的

数据多时不能一次返回全表。约定：

- `page`：第几页，从 1 开始
- `pageSize`：每页条数

### 查询 DTO

`src/users/dto/query-user.dto.ts`：

```ts
export class QueryUserDto {
  page?: number = 1;
  pageSize?: number = 10;
  username?: string;
  email?: string;
  status?: 'ACTIVE' | 'DISABLED';
}
```

注意：query 进来全是字符串，`"1"` 不是 `1`。第三阶段打开 `ValidationPipe.transform` 后会自动转。现在可在 Service 里手动 `Number(page)`。

### Service

```ts
async findAll(query: QueryUserDto) {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const skip = (page - 1) * pageSize;

  const where = {
    username: query.username ? { contains: query.username } : undefined,
    email: query.email ? { contains: query.email } : undefined,
    status: query.status,
  };

  const [list, total] = await Promise.all([
    this.prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { id: 'desc' },
      select: userPublicSelect,
    }),
    this.prisma.user.count({ where }),
  ]);

  return { list, total, page, pageSize };
}
```

`Promise.all` 同时查列表和总数，少一次等待。

MySQL 的 `contains` 是否大小写敏感，取决于表校对规则。`utf8mb4_unicode_ci` 一般不区分大小写。

### 验收

`GET /api/users?page=1&pageSize=2` 返回 2 条，`total` 是全表符合条件的数量。

---

## 步骤 4：条件搜索

与分页共用 `where`，见上一步。

```text
GET /api/users?username=tom&status=ACTIVE&page=1&pageSize=10
```

Prisma 里 `undefined` 的字段会被忽略，不会生成 `IS NULL`。不要传 `null` 除非你真的想查空值。

### 验收

只造部分匹配的数据，确认 `username=tom` 不会把 `jerry` 查出来。

---

## 步骤 5：用户详情 `GET /api/users/:id`

```ts
async findOne(id: number) {
  const user = await this.prisma.user.findUnique({
    where: { id },
    select: userPublicSelect,
  });

  if (!user) {
    throw new NotFoundException('用户不存在');
  }

  return user;
}
```

Controller：

```ts
@Get(':id')
@ApiOperation({ summary: '用户详情' })
findOne(@Param('id', ParseIntPipe) id: number) {
  return this.usersService.findOne(id);
}
```

`ParseIntPipe`：`/users/abc` 直接 400，不会把 `NaN` 传进数据库。

### 验收

存在的 id 返回对象；不存在返回 404。

---

## 步骤 6：修改用户 `PATCH /api/users/:id`

`src/users/dto/update-user.dto.ts`：

```ts
export class UpdateUserDto {
  username?: string;
  email?: string;
  nickname?: string;
}
```

不要在这里改 `password`（第四阶段）、不要让普通接口改 `role`（第四阶段管理员接口）。

```ts
async update(id: number, dto: UpdateUserDto) {
  await this.findOne(id);
  await this.ensureUnique(dto.username, dto.email, id);

  return this.prisma.user.update({
    where: { id },
    data: dto,
    select: userPublicSelect,
  });
}
```

先 `findOne` 是为了把「不存在」转成 404。Prisma 对不存在的 `update` 会抛 `P2025`，第三阶段过滤器也可统一处理。

Controller：

```ts
@Patch(':id')
@ApiOperation({ summary: '修改用户' })
update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
  return this.usersService.update(id, dto);
}
```

### 验收

改 nickname 成功；把 email 改成别人已有的，应 409。

---

## 步骤 7：删除用户 `DELETE /api/users/:id`

```ts
async remove(id: number) {
  await this.findOne(id);
  await this.prisma.user.delete({ where: { id } });
  return { id };
}
```

Controller：

```ts
@Delete(':id')
@ApiOperation({ summary: '删除用户' })
remove(@Param('id', ParseIntPipe) id: number) {
  return this.usersService.remove(id);
}
```

### 验收

删一次成功，再删同一 id 返回 404。

---

## 步骤 8：批量删除 `DELETE /api/users/batch`

### 路由顺序（必看）

Nest 按声明顺序匹配。如果先写 `@Delete(':id')`，再写 `@Delete('batch')`，请求 `/users/batch` 时 `batch` 会被当成 id，`ParseIntPipe` 失败。

**正确顺序：静态路径在前，参数路径在后。**

```ts
@Delete('batch')
@ApiOperation({ summary: '批量删除用户' })
removeMany(@Body() dto: BatchDeleteUserDto) {
  return this.usersService.removeMany(dto.ids);
}

@Delete(':id')
remove(@Param('id', ParseIntPipe) id: number) {
  return this.usersService.remove(id);
}
```

`src/users/dto/batch-delete-user.dto.ts`：

```ts
export class BatchDeleteUserDto {
  ids: number[];
}
```

```ts
async removeMany(ids: number[]) {
  const result = await this.prisma.user.deleteMany({
    where: { id: { in: ids } },
  });
  return { count: result.count };
}
```

### 验收

```bash
curl -X DELETE http://localhost:3000/api/users/batch \
  -H 'Content-Type: application/json' \
  -d '{"ids":[1,2,3]}'
```

返回删除条数。

---

## 步骤 9：用户状态管理 `PATCH /api/users/:id/status`

`src/users/dto/update-user-status.dto.ts`：

```ts
export class UpdateUserStatusDto {
  status: 'ACTIVE' | 'DISABLED';
}
```

```ts
async updateStatus(id: number, status: 'ACTIVE' | 'DISABLED') {
  await this.findOne(id);
  return this.prisma.user.update({
    where: { id },
    data: { status },
    select: userPublicSelect,
  });
}
```

Controller 同样要把 `:id/status` 写在 `:id` 前面（若都是 Patch，静态后缀更具体的放前面）：

```ts
@Patch(':id/status')
@ApiOperation({ summary: '启用或禁用用户' })
updateStatus(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: UpdateUserStatusDto,
) {
  return this.usersService.updateStatus(id, dto.status);
}
```

第四阶段登录时遇到 `DISABLED` 应拒绝。

---

## 步骤 10：唯一性校验

已在 `ensureUnique` 里实现。还有两道保险：

1. **应用层**：先查再插，提示更友好（409 + 中文）。
2. **数据库层**：schema 的 `@unique`。并发下两个人同时注册同一邮箱，应用层可能都查不到，数据库会拒绝，错误码 `P2002`。第三阶段在过滤器里把它转成 409。

更新时要用 `NOT: { id: excludeId }`，否则会把自己判成重复。

---

## Controller 方法最终顺序建议

```text
POST   /users
GET    /users
DELETE /users/batch
GET    /users/:id
PATCH  /users/:id/status
PATCH  /users/:id
DELETE /users/:id
```

原则：先静态、后参数；先更具体的 `:id/status`，后泛化的 `:id`。

---

## 复习清单

- [ ] 能说清 Module / Controller / Service 各自职责
- [ ] 会用 `create / findMany / findUnique / update / delete / deleteMany / count`
- [ ] 知道为什么 `select` 要去掉 password
- [ ] 知道为什么 `batch` 必须写在 `:id` 前面
- [ ] 重复邮箱返回 409，不存在返回 404

做完后进入 [03-接口规范.md](api-standards.md)。
