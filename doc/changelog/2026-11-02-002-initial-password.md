# CHG-20261102-002：首次设置用户密码

- 日期：2026-11-02（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。首次设密已实现；登录、JWT 和会话未实现，HTTP 未验证

## 背景与原因

创建用户不写密码，已有用户无法登录。这一步只允许给密码仍为空的启用用户设置一次密码，并保存 Argon2id 哈希。

## 涉及模块与文件

- `project/package.json`
- `project/pnpm-lock.yaml`
- `project/src/modules/auth/auth.module.ts`
- `project/src/modules/auth/password.service.ts`
- `project/src/modules/users/dto/set-initial-password.dto.ts`
- `project/src/modules/users/users.controller.ts`
- `project/src/modules/users/users.module.ts`
- `project/src/modules/users/users.service.ts`

## 具体变更

安装前核对 npm 元数据：`argon2@0.45.1` 同时是当前正式版本，`engines.node` 为 `>=16.17.0`，没有 peerDependencies。安装脚本是 `node-gyp-build`。使用 `pnpm add --save-exact argon2@0.45.1`，没有安装 `@nestjs/jwt`。

pnpm 返回 `ERR_PNPM_IGNORED_BUILDS`，没有执行 argon2 的安装脚本。没有运行 `pnpm approve-builds`，也没有把 argon2 加入 `allowBuilds`。当前包内预编译文件仍可加载。

`PasswordService` 使用 Argon2id，`memoryCost=19456`、`timeCost=2`、`parallelism=1`。`POST /api/v1/users/:id/password` 只接收 `password`，长度 15～128，不 trim。哈希在更新前计算。条件为密码为空、`deletedAt` 为空且 `status` 为 1。成功返回公开用户资料。不存在或已标记删除返回 404；已禁用或密码已有值返回 409。创建和资料更新仍拒绝 `password`。

## 兼容性影响

新增一个未认证的本地管理接口，与现有用户接口的暴露范围相同。对外提供前必须先加 Guard。已有密码不能通过该接口覆盖。

## 数据库影响

没有新增或修改迁移。`users.password` 仍是可空 `VARCHAR(255)`。本地试算的 Argon2id 编码长度为 97，可以放入该列。未把试算结果写入数据库。

## 验证方式与结果

2026-11-02，Darwin，运行目录 `project/`。直接使用已安装的 `tsc`、`eslint`、`prettier`，因为 `pnpm exec` 试图整理依赖目录并因无 TTY 中止。

- `tsc --noEmit -p tsconfig.build.json` 退出 0
- `eslint src/modules/auth src/modules/users --max-warnings=0` 退出 0
- `prettier --check src/modules/auth src/modules/users` 退出 0
- 本地加载 argon2 后，试算哈希前缀为 `$argon2id$`，校验正确密码为真、错误密码为假

未执行 Jest、HTTP、`migrate`。不将阶段 04、05 标为已验证。

## 关联文档

- [阶段 04](../04-user-management/implementation.md)
- [阶段 05](../05-authentication/implementation.md)
- [技术栈](../00-overview/tech-stack.md)
