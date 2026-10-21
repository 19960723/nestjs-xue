> 历史归档（2026-10-21），原位置：`doc/04-认证权限.md`。以下保留旧方案用于追溯，其中版本、阶段、状态与代码示例可能过时；当前实施请从 [文档导航](../README.md) 开始。

# 第四阶段：登录认证与权限管理

目标：能注册能登录，密码只存哈希，JWT 保护接口，管理员和普通用户权限不同。

上一阶段：CRUD 和统一响应已就绪。用户表已有 `password`、`role` 字段。

## 要搞懂什么

```text
注册：明文密码 → argon2.hash → 存入 users.password
登录：查用户 → argon2.verify → jwt.sign({ sub, role }) → 返回 accessToken
访问：Header Authorization: Bearer <token>
      → JwtAuthGuard → JwtStrategy 解析
      → request.user
      → RolesGuard 比较角色
```

- **Guard**：决定能不能进 Controller。认证、鉴权都放这里。
- **Passport + JWT**：Nest 官方常见写法。Strategy 负责「怎么从请求里取出并验证 token」。
- **RBAC**：按角色控制接口，不是按人写死。

---

## 步骤 0：安装与模块

```bash
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt argon2
pnpm add -D @types/passport-jwt
npx nest g module auth
npx nest g controller auth --no-spec
npx nest g service auth --no-spec
```

补全所有 `.js` 后缀。`AuthModule` 需要用到 `UsersService` 时，要在 `UsersModule` 里 `exports: [UsersService]`。

`.env` 增加：

```env
JWT_SECRET=请换成至少 32 位的随机字符串
JWT_EXPIRES_IN=7d
```

`JWT_SECRET` 泄漏等于谁都能伪造 token。不要用 `123456`。

---

## 步骤 1：用户注册 `POST /api/auth/register`

可以复用 `CreateUserDto`，或单独 `RegisterDto`（字段相同）。

`AuthService.register`：

```ts
async register(dto: RegisterDto) {
  const hash = await argon2.hash(dto.password);

  const user = await this.prisma.user.create({
    data: {
      username: dto.username,
      email: dto.email,
      password: hash,
      nickname: dto.nickname,
    },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      status: true,
      role: true,
      createdAt: true,
    },
  });

  return user;
}
```

重复用户名/邮箱走已有的唯一校验或 `P2002`。

第二阶段 `POST /api/users` 若仍存明文，学习阶段可以：

- 管理端创建用户也改为哈希；或
- 关掉该接口，只保留注册。

不要同时存在「明文创建」和「哈希登录」，否则旧用户永远登不上。

---

## 步骤 2：密码加密（Argon2）

### 为什么不用 MD5 / SHA256

它们是摘要，算得快，适合被彩虹表撞。密码哈希必须**慢**，并且自带盐。

Argon2 是现在常见选择，Node 有官方库 `argon2`。

```ts
import * as argon2 from 'argon2';

const hash = await argon2.hash('123456');
const ok = await argon2.verify(hash, '123456'); // true
```

库里只存 `hash`。校验时用 `verify(库中哈希, 用户输入)`，不要自己截盐。

默认参数对学习足够。生产可再调 `memoryCost`，这里不必提前优化。

---

## 步骤 3：用户登录 `POST /api/auth/login`

`src/auth/dto/login.dto.ts`：

```ts
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @Length(6, 64)
  password: string;
}
```

```ts
async login(dto: LoginDto) {
  const user = await this.prisma.user.findUnique({
    where: { username: dto.username },
  });

  const passwordValid =
    user && (await argon2.verify(user.password, dto.password));

  if (!user || !passwordValid) {
    throw new UnauthorizedException('用户名或密码错误');
  }

  if (user.status === 'DISABLED') {
    throw new UnauthorizedException('账号已禁用');
  }

  const accessToken = await this.jwt.signAsync({
    sub: user.id,
    role: user.role,
  });

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: this.config.get('JWT_EXPIRES_IN'),
  };
}
```

安全细节：

- 用户不存在和密码错误返回**同一句话**，避免被用来枚举账号。
- `argon2.verify` 在哈希格式错误时会抛异常，用 try/catch 包一层也可以，最终仍返回「用户名或密码错误」。

---

## 步骤 4：JWT Token

### AuthModule 配置

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN') ?? '7d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

`registerAsync` 才能在工厂函数里读 `ConfigService`，不要把 secret 写死在代码里。

### payload 约定

```ts
{ sub: user.id, role: user.role }
```

- `sub` 是 JWT 惯例，表示主体（用户 id）
- 不要把密码放进 payload，JWT 只是 Base64，能被解码

Swagger 登录后，点 Authorize，填 `Bearer` 的 token（有的 UI 只填 token 本身，看是否自动加前缀）。

---

## 步骤 5：登录状态验证

### JwtStrategy

`src/auth/jwt.strategy.ts`：

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service.js';

interface JwtPayload {
  sub: number;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        status: true,
        role: true,
      },
    });

    if (!user || user.status === 'DISABLED') {
      throw new UnauthorizedException('登录已失效');
    }

    return user; // 注入到 request.user
  }
}
```

token 过期、签名错误时 Passport 直接 401，进不了 `validate`。

### JwtAuthGuard

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

### @Public()

`src/common/decorators/public.decorator.ts`：

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

登录、注册加 `@Public()`。Swagger 文档本身不是 Nest Controller，不受 Guard 影响。

### 全局 Guard

`app.module.ts`：

```ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';

providers: [
  AppService,
  { provide: APP_GUARD, useClass: JwtAuthGuard },
],
```

全局之后，忘加 Guard 也不会把接口暴露出去。公开接口显式 `@Public()` 更安全。

`AppController` 的 Hello 若不登录就访问，也要加 `@Public()`，否则连健康检查都 401。

---

## 步骤 6：获取当前用户 `GET /api/auth/profile`

`src/common/decorators/current-user.decorator.ts`：

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

```ts
@Get('profile')
@ApiBearerAuth()
@ApiOperation({ summary: '当前登录用户' })
profile(@CurrentUser() user: { id: number }) {
  return this.usersService.findOne(user.id);
}
```

`@CurrentUser('id')` 可以直接取 id。

复习：装饰器不是魔法，只是从 `request.user` 取值。`user` 来自 `JwtStrategy.validate` 的返回值。

---

## 步骤 7：角色管理

表字段 `role`：`ADMIN` | `USER`，注册默认 `USER`。

改角色仅管理员：

```ts
@Patch(':id/role')
@Roles('ADMIN')
updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: { role: 'ADMIN' | 'USER' }) {
  return this.usersService.updateRole(id, dto.role);
}
```

第一个管理员怎么来：

1. 用 Prisma Studio 把某条记录的 `role` 改成 `ADMIN`；或
2. 写一个一次性 seed 脚本。

不要做「任何人可注册成管理员」的接口。

---

## 步骤 8：接口权限控制

### @Roles()

```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

### RolesGuard

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    return roles.includes(user?.role);
  }
}
```

没有 `@Roles()` 的接口：只要登录就能访问。有 `@Roles('ADMIN')`：角色不匹配 → Guard 返回 `false` → Nest 抛 403。

全局注册 RolesGuard（在 JwtAuthGuard 之后）：

```ts
{ provide: APP_GUARD, useClass: JwtAuthGuard },
{ provide: APP_GUARD, useClass: RolesGuard },
```

多个 `APP_GUARD` 按 providers 顺序执行。必须先认证，`request.user` 才有值。

### 建议划分

| 接口 | 谁能访问 |
| --- | --- |
| 注册、登录 | `@Public()` |
| 当前用户、改自己密码 | 登录即可 |
| 用户列表、删除、改角色、改状态 | `@Roles('ADMIN')` |

---

## 步骤 9：修改密码 `PATCH /api/auth/password`

```ts
export class ChangePasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @Length(6, 64)
  newPassword: string;
}
```

```ts
async changePassword(userId: number, dto: ChangePasswordDto) {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundException('用户不存在');

  const ok = await argon2.verify(user.password, dto.oldPassword);
  if (!ok) throw new UnauthorizedException('旧密码错误');

  await this.prisma.user.update({
    where: { id: userId },
    data: { password: await argon2.hash(dto.newPassword) },
  });

  return { success: true };
}
```

改完后，旧 JWT 在过期前仍有效（JWT 无状态）。要立即失效，需要黑名单，见步骤 10 和第五阶段 Redis。

---

## 步骤 10：退出登录 `POST /api/auth/logout`

JWT 发出去之后，服务器默认无法收回。可选方案：

| 方案 | 做法 | 适合 |
| --- | --- | --- |
| 前端丢弃 | 前端删 token，接口直接返回成功 | 学习阶段 |
| 短过期 + 刷新令牌 | accessToken 15 分钟，refresh 单独存 | 正规产品 |
| 黑名单 | 把 `jti` 或整个 token 写入 Redis，Guard 里拒绝 | 第五阶段 |

本阶段最小实现：

```ts
@Post('logout')
logout() {
  return { success: true };
}
```

文档里写清楚：客户端必须丢掉本地 token。

若要做黑名单，签发时加 `jti: randomUUID()`，登出时 `SET jwt:blacklist:{jti} 1 EX 过期秒数`，Strategy 里查到则 401。

---

## AuthController 一览

```ts
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @ApiBearerAuth()
  profile(@CurrentUser() user: { id: number }) {
    return this.authService.profile(user.id);
  }

  @Patch('password')
  @ApiBearerAuth()
  changePassword(
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @Post('logout')
  @ApiBearerAuth()
  logout() {
    return this.authService.logout();
  }
}
```

---

## 第四阶段总验收

- [ ] 注册后数据库里的 password 不是明文，而是 `$argon2...` 开头
- [ ] 错误密码与不存在用户提示相同，HTTP 401
- [ ] 禁用用户无法登录
- [ ] 不带 token 访问 `/api/users` → 401
- [ ] 带 token 访问 `/api/auth/profile` 返回自己
- [ ] 普通用户调管理员接口 → 403
- [ ] 改密码后用旧密码登录失败

做完后进入 [05-进阶工程化.md](engineering.md)。
