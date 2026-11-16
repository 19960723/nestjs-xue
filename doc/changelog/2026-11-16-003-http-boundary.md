# CHG-20261116-003：HTTP 安全边界

- 日期：2026-11-16（Asia/Shanghai）
- 变更类型：新增
- 文档状态：已更新
- 功能状态：进行中。安全头、跨域和 JSON 体积已接入；结构化 JSON 日志未改，阶段 08 整体未完成

## 背景与原因

接口已经对公网前的本机开发开放了登录和用户资料。响应头、跨域和请求体大小还没有统一限制。

## 涉及模块与文件

- `project/src/bootstrap/configure-app.ts`
- `project/src/app.module.ts`
- `project/src/main.ts`
- `project/src/config/env.validation.ts`
- `project/src/common/filters/all-exceptions.filter.ts`
- `project/.env.example`
- 依赖 `helmet@8.3.0`

## 具体变更

启动时关闭默认 JSON 解析，再按 `JSON_BODY_LIMIT_BYTES` 挂上解析器。默认和上限都是 1 MiB。超出返回 413，`code` 为 `VALIDATION_ERROR`，文案是「请求体过大」。

`helmet` 写入安全响应头并去掉 `X-Powered-By`。Swagger 开启时放宽内容安全策略。`CORS_ORIGINS` 为空时不回写跨域头，不接受通配，也不携带凭据。`TRUSTED_PROXY` 只接受 1..5；登录来源仍看套接字地址。

访问日志没有改成一行 JSON。

## 兼容性影响

未列入 `CORS_ORIGINS` 的浏览器来源不会得到跨域许可。超过 1 MiB 的 JSON 会被拒绝。本机 curl 不受跨域影响。

## 数据库影响

无 Schema 变更。没有新迁移。

## 验证方式与结果

Darwin arm64。工作目录 `project/`。`tsc --noEmit --incremental false -p tsconfig.build.json`、`tsc --noEmit --incremental false -p tsconfig.test.json`，以及改动文件的 ESLint、Prettier，退出码都是 0。配置单测没有单独执行。

重启后 `GET /health/live` 为 200，`code` 为 `OK`。响应没有 `X-Powered-By`，`X-Content-Type-Options` 为 `nosniff`。带上未配置的浏览器来源时，没有 `Access-Control-Allow-Origin`。超过 1 MiB 的登录 JSON 返回 413，`code` 为 `VALIDATION_ERROR`。一条正常大小的错误登录仍返回 401。阶段 08 不标为已验证。

## 关联文档

[阶段 08](../08-common/implementation.md)、[技术栈](../00-overview/tech-stack.md)。
