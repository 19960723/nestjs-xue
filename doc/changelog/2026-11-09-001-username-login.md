# CHG-20261109-001：用户名登录

- 日期：2026-11-09（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。用户名登录已实现；刷新、Guard、退出和重置未实现，HTTP 未验证

## 背景与原因

首次设密之后，已有密码的启用用户仍无法建立会话。这一步只增加用户名密码登录，把 Refresh 摘要写入已有会话表，并签发短期 Access JWT。

## 涉及模块与文件

- `project/package.json`
- `project/pnpm-lock.yaml`
- `project/.env.example`
- `project/test/setup-env.ts`
- `project/src/app.module.ts`
- `project/src/config/env.validation.ts`
- `project/src/config/env.validation.spec.ts`
- `project/src/modules/auth/auth.module.ts`
- `project/src/modules/auth/auth.controller.ts`
- `project/src/modules/auth/auth.service.ts`
- `project/src/modules/auth/dto/login.dto.ts`
- `project/src/modules/auth/dto/token-set.dto.ts`

## 具体变更

安装前只读核对 npm 元数据：`@nestjs/jwt@12.0.3` 没有 `engines`，`peerDependencies` 为 `@nestjs/common` 的 `^8.0.0 || ^9.0.0 || ^10.0.0 || ^11.0.0 || ^12.0.0`。registry 当前版本是 `12.0.4`，peer 相同。按既定基线执行 `pnpm add --save-exact @nestjs/jwt@12.0.3`，没有安装 Passport。

配置新增必填 `JWT_SECRET`（至少 32 个字符）、`JWT_ISSUER`、`JWT_AUDIENCE`。`JWT_ACCESS_TTL_SECONDS` 默认 900，上限 86400；`REFRESH_TTL_SECONDS` 默认 604800，上限 2592000。Access 有效期必须小于 Refresh 有效期。错误信息不回显密钥。

`POST /api/v1/auth/login` 接收 trim 后 1～50 的用户名，以及 15～128 且不 trim 的密码。用户不存在、未设密、已禁用、已软删或密码错误都返回「用户名或密码错误」。无用户或密码为空时，用同成本的预生成 Argon2id 哈希校验一次，结果不作为登录依据。

校验通过后，短事务重读用户。仅当未删除、状态为启用且密码哈希未变时，插入 `sys_user_session`。Refresh 原文只出现在响应中，库里保存 SHA-256 十六进制摘要。设备、IP 和 User-Agent 留空。事务提交后用 HS256 签发 Access，payload 只有 `sub`、`sid`、`jti`。签名失败时撤销该会话并返回 500，不返回 token。成功响应设置 `Cache-Control: no-store`。

没有刷新接口，没有全局 Guard，没有新迁移。

## 兼容性影响

启动配置新增三个必填项，缺少时进程无法启动。已有用户和角色接口仍未认证。已有密码不能被登录接口改写。registry 上的 12.0.4 未采用。

## 数据库影响

没有新增或修改迁移。登录成功会向已有 `sys_user_session` 插入一行。未执行迁移或真实写入。

## 验证方式与结果

2026-11-09，Darwin arm64，Node 24.18.0，pnpm 11.13.1。运行目录 `project/`。直接使用已安装的 `tsc`、`eslint`、`prettier`。

- `tsc --noEmit --incremental false -p tsconfig.build.json` 退出 0
- `eslint src/modules/auth src/config src/app.module.ts test/setup-env.ts --max-warnings=0` 退出 0
- `prettier --check` 覆盖上述路径，格式化两个文件后退出 0

未执行 Jest、HTTP、`migrate` 或真实登录。不将阶段 05 标为已验证。

## 关联文档

- [阶段 05](../05-authentication/implementation.md)
- [阶段 04](../04-user-management/implementation.md)
- [技术栈](../00-overview/tech-stack.md)
