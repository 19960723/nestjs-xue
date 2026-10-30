# CHG-20261026-001：完善角色 DTO 校验与字段契约

- 日期：2026-10-26（Asia/Shanghai）
- 变更类型：修改
- 文档状态：已更新
- 功能状态：DTO 局部已实现，类型/构建及目标文件静态检查已验证；运行行为待验证，完整 RBAC 仍计划中

## 背景与范围

用户明确要求完善 `create-role.dto.ts`。当前角色模块为用户未提交的骨架，DTO 缺少 status/sort，code 的最小长度仅写在 Swagger 中，description 的 200 字符限制与现有 Schema 的 255 不一致。更新 DTO 默认 PartialType 又会跳过 null 校验。本次在原文件上完善输入契约，并保留其他未提交修改。

## 具体变更

- `project/src/modules/roles/dto/create-role.dto.ts`：name/code/description 仅在输入为字符串时 trim；name 长度 1～50，code 长度 2～50 且以字母开头、后续仅含字母/数字/下划线/连字符，保留 ADMIN 示例及大小写；补齐中文校验信息。
- description 与 Schema 对齐为最长 255，TypeScript 和 Swagger 均明确允许 null。
- 新增可选 status（整数 0/1）和 sort（整数 0～2147483647）；省略时不在 DTO 注入默认值，Swagger 标注数据库默认值 1/0。拒绝 null、数字字符串及布尔值。
- `project/src/modules/roles/dto/update-role.dto.ts`：PartialType 设置 skipNullProperties=false，省略字段仍合法，仅 description 可传 null；避免未来 PATCH 意外写入默认状态或排序值。
- 原阶段 06 增补当前契约、目标差异及证据，同步导航、路线图和文档清单。

## 兼容性与数据库影响

校验更严格：单字符/非法字符编码、纯空白名称、非法数字或 null 状态/排序会被拒绝，字符串首尾空白会被去除；description 接受范围从 200 放宽到 255。现有大写编码仍可使用，不自动归一大小写。code 唯一性仍须后续由 Service/数据库处理。

无依赖、Schema、迁移或数据变更。当前 Service 返回占位字符串，不实现持久化、授权、code 不可变或空 PATCH 拒绝；未来 RBAC 目标契约与当前输入规则的差异已在阶段 06 第 5.3.1 节说明。回滚时仅撤销本次两个 DTO 及匹配文档的增量，不移除用户的角色模块。

## 验证方式与结果

Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3；工作目录 `project/`，以下检查均退出 0：

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`
- `pnpm run build`
- `pnpm exec eslint src/modules/roles/dto/create-role.dto.ts src/modules/roles/dto/update-role.dto.ts --max-warnings=0`
- `pnpm exec prettier --check src/modules/roles/dto/create-role.dto.ts src/modules/roles/dto/update-role.dto.ts`

收尾检查：6 份变更文档的 112 个本地链接目标及阶段 06 的十章节结构检查通过；仓库根目录 `git diff --check` 退出 0。

按现有约定暂不新增或执行测试；DTO 运行时、HTTP 和 OpenAPI 生成未验证。未连接数据库、读取真实环境配置、安装、generate、迁移或部署。上述结果不代表全仓 lint/格式、业务或阶段验收通过。

## 同日后续：完善角色查询 DTO

用户继续要求完善空文件 `project/src/modules/roles/dto/query-role.dto.ts`。新增导出的 QueryRoleDto：

- page 默认 1、范围 1～2147483647；pageSize 默认 10、范围 1～100，与当前用户列表默认值一致。
- keyword 可选，trim 后最长 50，约定供后续按角色名称或编码搜索；空字符串表示不筛选。
- status 可选且只允许整数 0/1，不设置默认值，保留不筛选及筛选禁用状态 0 的语义。
- 数字查询参数显式转换十进制数字字符串，拒绝空串、小数、科学计数法、十六进制、布尔值、数组或对象被强制转换；各字段均拒绝 null。
- 补齐中文校验信息及 Swagger 的类型、边界、示例和分页默认值。

仅新增 DTO 内容并更新原阶段及本变更记录，不修改创建/更新 DTO、Controller、Service、依赖、Schema 或数据库。列表接口仍返回占位字符串，尚未绑定查询 DTO；上述筛选语义须在后续业务接入时实现。回滚时仅撤销本次 query-role.dto.ts 内容和文档增量。

验证环境仍为 Darwin arm64、Node 24.18.0、pnpm 11.13.1、TypeScript 6.0.3，工作目录 `project/`，以下命令均退出 0：

- `pnpm exec tsc --noEmit --incremental false -p tsconfig.build.json`
- `pnpm run build`
- `pnpm exec eslint src/modules/roles/dto/query-role.dto.ts --max-warnings=0`
- `pnpm exec prettier --check src/modules/roles/dto/query-role.dto.ts`

未新增或执行测试，运行时转换/校验、HTTP、OpenAPI 生成及数据库查询未验证；无安装、generate、迁移或部署。

关联：[阶段 06](../06-authorization/implementation.md)、[公共 API 约定](../03-api-standards/implementation.md)、[测试阶段及暂缓约定](../09-testing/implementation.md)。
