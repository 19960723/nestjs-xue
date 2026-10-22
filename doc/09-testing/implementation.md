# 阶段 09：测试与代码质量

更新：2026-10-21。文档状态：已编写；功能状态：计划中。工具迁移5.1在01执行；完整分层/CI依赖02～08。5.1 的最小工具迁移已在阶段 01 本地验证：现为 Jest/ESLint/Prettier，27 项单元测试与 5 项 HTTP E2E 通过；其余分层测试、覆盖率门禁和 CI 仍计划中。

## 1. 阶段目标

建立Jest单测、Repository真实数据库集成测试、HTTP E2E、类型/风格/覆盖率和CI门禁。质量工作贯穿前八阶段，本阶段汇总完善，不能等现在才补安全关键测试。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| Jest ESM迁移 | 对齐目标工具 | P0（01执行） | TS6/Nest12 | tsc保留元数据、JS直接运行测试 |
| Service/Controller单测 | 验证规则和HTTP边界 | P0 | 业务模块 | 关键分支/错误/边界均有断言 |
| Repository集成 | 验证真实DB语义 | P0 | 隔离MySQL | 唯一/FK/隔离/事务/轮换竞争 |
| E2E/权限矩阵 | 验证完整请求生命周期 | P0 | 全应用 | Guard/Pipe/异常/响应与实际一致 |
| ESLint/类型/格式 | 静态门禁 | P0 | 01配置 | 无warning、类型错误、格式漂移 |
| 覆盖率/CI | 可持续回归 | P0 | 上述全部 | 干净环境可重复且失败阻断合并 |

## 3. 技术原理

Mock验证业务协作，无法证明数据库事务、唯一索引或锁行为；集成测试使用真实MySQL8.4，不能用SQLite替代后声称MySQL兼容。E2E需调用与main相同的bootstrap配置，单纯createNestApplication不等于已注册全局Pipe/前缀/过滤器。

Jest ESM仍有实验性限制；本项目用tsc预编译业务与测试，transform为空，VM modules运行编译JS，保持装饰器元数据和NodeNext导入。无需未经验证的ts-jest/TS6或Babel元数据插件组合。参考 [Jest ESM](https://jestjs.io/docs/ecmascript-modules)、[Jest 30基础配置](https://jestjs.io/docs/30.0/configuration)、[Nest测试](https://docs.nestjs.com/fundamentals/testing)，最终选项以安装的30.5.2声明和运行结果核实。

## 4. 实现前准备

主体工具版本见01和技术栈；已精确安装 @types/jest 30.0.0、@jest/globals 30.5.2，新增或升级仍须核实兼容。Supertest已实装7.3.1，@nestjs/testing与core同12.1.3。无需新测试框架。

测试库使用专用低权限账户、明确允许的测试主机和库名`init_xue_test_<runid>`，不能复用开发库/生产库。TEST_DATABASE_URL独立保管；测试入口必须在导入AppModule/Prisma配置前将其赋给DATABASE_URL并设置NODE_ENV=test，且检查库名/主机白名单。清理必须限定本次拥有的测试资源，未知环境直接失败，不自动migrate reset。

## 5. 详细实施步骤

### 5.1 迁移测试运行器与编译配置

实施状态：已在阶段 01 本地验证；以下为可复核的配置与维护方法。当前 E2E/integration 配置额外加载 test/setup-env.ts 的编译产物，固定 NODE_ENV=test 并关闭 Observe；数据库集成前仍须按 5.3 补专用测试库保护。

- 目标：在01就有可运行Jest的最小工具链。
- 文件：新建 `project/tsconfig.test.json`、`project/jest.config.mjs`、`project/jest.e2e.config.mjs`、`project/jest.integration.config.mjs`、`project/scripts/clean-test-dist.mjs`；修改package、现有测试/tsconfig types。
- 操作：tsconfig.test覆盖NodeNext项目中的输出目录和测试类型；不要直接把业务切CJS。

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".", "outDir": ".test-dist",
    "types": ["node", "jest"],
    "incremental": false, "declaration": false,
    "sourceMap": true, "noEmit": false
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist", ".test-dist"]
}
```

```js
// project/jest.config.mjs
export default {
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['reflect-metadata'],
  testMatch: ['<rootDir>/.test-dist/src/**/*.spec.js'],
  coverageProvider: 'v8',
  collectCoverageFrom: [
    '.test-dist/src/**/*.js',
    '!.test-dist/src/**/*.spec.js',
    '!.test-dist/src/generated/**',
  ],
};
```

- E2E/integration配置各import base并覆盖testMatch：`.test-dist/test/**/*.e2e-spec.js`、`.test-dist/test/**/*.integration-spec.js`；保留各自coverage目录。`clean-test-dist.mjs`只针对自身固定`../.test-dist`路径调用rmSync recursive/force，不能接受任意外部路径，以免删错，也避免已删除测试的旧JS继续被执行。
- package scripts核心（后续手动写入）：

```json
{
  "test:compile": "node scripts/clean-test-dist.mjs && tsc -p tsconfig.test.json",
  "test": "pnpm run test:compile && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.mjs",
  "test:cov": "pnpm run test:compile && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.mjs --coverage",
  "test:e2e": "pnpm run test:compile && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.e2e.config.mjs --runInBand",
  "test:integration": "pnpm run test:compile && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.integration.config.mjs --runInBand",
  "test:debug": "pnpm run test:compile && node --inspect-brk --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.mjs --runInBand",
  "typecheck:test": "tsc --noEmit -p tsconfig.test.json"
}
```

- 解释：各命令直接调用Jest，避免包管理器参数转发歧义。E2E环境准备使用独立`test/setup-env`启动模块或进程环境，必须先设置再动态import应用；unit不导入带副作用AppModule。Jest ESM mock使用从`@jest/globals`显式import的jest，不能假定`jest`对象全局可用；优先DI mock Provider而非模块级jest.mock。
- Watch：移除原来调用Vitest的test:watch，避免卸载后留下坏脚本。需要开发监听时先test:compile，再在终端A运行 `pnpm exec tsc -p tsconfig.test.json --watch`，终端B运行 `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.mjs --watch`；只开Jest监听编译目录不会重新编译TS，不能误以为改动已被测试。
- 命令：`pnpm run typecheck:test`、`pnpm test`，检查编译输出为`.test-dist/src/...`且相对.js导入存在。01只编译现有文件，不要求尚未生成的Prisma；02起先prisma:generate再编译。
- 预期/验证：Nest测试DI能取得元数据，现有两个示例测试按真实响应修正后通过。新工具成功后才移除Vitest/Oxlint依赖/配置、更新单锁文件，迁移完成状态回填01/技术栈。

### 5.2 分层单元测试

- 目标：验证业务规则，而不是复述实现。
- 文件：各 `project/src/modules/*/*.spec.ts`；测试共用fixture放 `project/test/fixtures/`。
- 操作：Service注入fake Repository/密码/时钟/Delivery，测试公开行为和调用参数中的安全字段；Controller通过Test模块注入Service mock，确认状态码/DTO后进入用例；真正Pipe/Guard顺序放E2E。Prisma mock只覆盖使用到的具体方法，不用`as any`伪装整个PrismaClient。
- 场景：用户唯一冲突、已删404、非法激活；认证统一失败、撤销、版本不匹配；RBAC默认拒绝/AND/对象范围；缓存坏数据/失败回源。用注入时钟替代长sleep，哈希昂贵测试限制并发并区分真实参数smoke与mock。
- 命令：`pnpm test`；`pnpm run typecheck:test`同时检查测试代码类型。
- 预期/验证：关键路径失败时有有意义断言，不把调用次数或完整内部快照当全部测试目标；单测不建立真实DB/Redis连接。

### 5.3 真实数据库与Redis集成测试

- 目标：验证Mock无法保障的约束和并发。
- 文件：`project/test/{database,users,auth,authorization,redis}.integration-spec.ts`，`test/setup-test-env.ts`，隔离服务Compose/CI配置。
- 操作：每job独立测试库和Redis前缀；setup先校验专用TEST_DATABASE_URL库名/主机，再给迁移进程传入DATABASE_URL运行已提交`migrate deploy`+显式seed，随后加载应用。不得让测试进程意外读个人.env。数据库清理仅限本次拥有的数据；使用唯一runid隔离fixture，外键依赖逆序清理，不关FK绕过测试。
- 必测：唯一冲突并发、批量回滚、软删唯一保留、Auth刷新条件消费/重放撤销提交、并发改密/退出/禁用、两个管理员竞争、Redis脚本TTL/共享配额、审计失败业务回滚。
- 命令：用户确认隔离环境后运行 `pnpm run test:integration`，每次保留版本、迁移列表和脱敏失败信息。
- 预期/验证：同真实MySQL隔离级别与adapter执行；refresh重放事务提交后session.revokedAt可查询到；测试失败也close Prisma/Redis，CI没有悬挂连接。

### 5.4 HTTP E2E与OpenAPI回归

- 目标：覆盖整个安全/协议边界。
- 文件：`project/src/bootstrap/configure-app.ts`（main与test共用，若03已建则更新原文件）、各 `project/test/*.e2e-spec.ts`。
- 操作：创建完整应用后调用configureApp，再init；afterAll关闭。流程：授权bootstrap管理员→创建/注册测试账号→登录→权限分配→CRUD→撤权→403→退出→旧token401。禁用注册时采用安全fixture建号，不为测试永久开放注册。health、Swagger、下载流、上传413、错误requestId也要覆盖。
- API断言：正常码与03包装，错误details不回显凭据，缺token401/无权403/非法DTO400顺序明确；OpenAPI JSON路由、Bearer标记、分页/错误schema与实际匹配，破坏性diff需要更新契约/版本。
- 命令：`pnpm run test:e2e`；对构建产物再做一次health与登录关键smoke，防测试编译路径与dist路径差异。
- 预期/验证：测试有失败清理，HTTP后台连接关闭；不是在E2E里全mock数据库再宣称部署路径通过。

### 5.5 质量门禁、覆盖率与CI

- 目标：干净机器能重复构建验证。
- 文件：修改package质量脚本、Jestcoverage阈值，新建根 `.github/workflows/ci.yml`（属于后续代码授权范围）。
- 操作：工作目录统一project；固定Node/pnpm，frozen-lockfile；先生成Prisma，再typecheck/typecheck:test/lint/format:check/build/unit coverage；独立job用MySQL8.4与Redis固定版本/digest运行集成/E2E。主机job连127.0.0.1映射端口，容器job连service名称，不混用。
- 阈值：初期global lines/functions/statements>=80%、branches>=70%，安全模块关键分支必须全部有场景；不靠排除业务文件“凑覆盖率”。V8从编译JS映射回TS需验证sourceMap；生成client可排除。覆盖率产物和JUnit报告使用兼容的现有格式，无必要不新增reporter依赖。
- 命令：依次运行上述package scripts；CI用与本地一致命令，不通过跳过lint/test获得绿灯。依赖审计结果审阅并记录，不能自动`audit fix --force`改栈。
- 预期/验证：故意引入类型/格式/测试失败都阻断job，fork PR不获得生产Secrets；缓存只缓存pnpm store且key含锁文件，不能缓存宿主node_modules到不同平台。

## 6. 数据库设计

不新增业务Schema；测试fixture/库是隔离数据。测试迁移只能验证仓库已有migration，不能使用db push绕过历史。若测试暴露数据结构问题，回到所属阶段更新Schema/迁移说明/ADR后再修复，不在测试setup偷偷改生产模型。

## 7. API 设计

不新增业务端点。API用例矩阵以04～08的端点表为准，测试至少覆盖正常/参数错误/未认证/无权限/不存在/冲突/限流/依赖故障。例：相同GET `/api/v1/users/1`，无token401、有身份无users:read403、有权限但不存在404、有权限存在200。

运行示例：`pnpm run test:e2e`；预期断言03的data/requestId和真实HTTP状态，测试不输出真实Access/Refresh内容。

## 8. 验收标准

- [x] Jest最小迁移已在01完成，TS6/ESM/DI元数据可用，旧工具清理经过审阅。
- [ ] 单测、真实DB/Redis集成、HTTP E2E层次与证据明确。
- [ ] 类型/格式/lint/build/覆盖率/关键安全场景全部通过。
- [ ] 测试库保护和清理范围验证，未碰开发/生产数据。
- [ ] CI从干净checkout运行通过，失败能阻断合并，未暴露生产Secrets。

验收记录：5.1 最小工具迁移的验收见 [阶段01第8节](../01-initialization/implementation.md#8-验收标准)；5.2～5.5 的完整业务分层、数据库/Redis 集成、覆盖率与 CI 尚未验收，不据此标记阶段09已完成。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| jest is not defined | ESM显式import `{jest}` from @jest/globals |
| DI构造函数参数undefined | 检查测试预编译emitDecoratorMetadata/reflect-metadata；不盲加@Inject掩盖工具错误 |
| 测试通过而生产导入失败 | 直接node dist验证；不要用Jest路径映射遮住错误.js导入 |
| 已删测试仍在跑 | .test-dist旧JS未清理，固定清理生成目录再编译 |
| E2E无前缀/校验/Guard | 没复用main的configureApp或全局Provider未导入 |
| Jest退出挂起 | app.close/Prisma/Redis/timers未释放，不用forceExit掩盖 |

## 10. 后续扩展

[10](../10-deployment/implementation.md)以全绿CI产物发布；性能/容量/混沌测试按真实SLO增加。每个未来功能必须在原阶段补文档/测试并更新变更记录，不能把当前覆盖率当永久安全保证。
