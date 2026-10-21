# 阶段 10：部署与运维

更新：2026-10-21。文档状态：已编写；功能状态：计划中。前置：[07](../07-redis/implementation.md)～[09](../09-testing/implementation.md)及安全验收。本次没有创建镜像、启动容器、安装依赖或连接数据库。

## 1. 阶段目标

构建可重复的应用/迁移镜像，明确配置与Secrets、一次性迁移、健康探针、发布回滚、备份恢复和告警。Compose适合本地与单机起步，生产高可用数据库/Redis不由一份Compose自动保证。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| 多阶段Dockerfile | 分离构建/运行/迁移 | P0 | CI/Prisma生成 | Linux镜像可运行、非root、无Secret |
| Compose | 重复搭建隔离环境 | P0 | Docker/服务版本 | MySQL/Redis/app按依赖就绪 |
| Secrets/安全 | 防凭据/网络暴露 | P0 | 配置校验 | runtime无DDL、数据库不公开、HTTPS |
| 迁移发布流程 | 避免多副本重复迁移 | P0 | 迁移历史 | 单次作业成功后再放流量 |
| 备份与恢复 | 可恢复数据 | P0 | 保留策略 | 新隔离库实际恢复并校验 |
| 回滚/监控告警 | 发现/止损 | P0 | 日志/探针 | 回滚演练和报警演练有证据 |

## 3. 技术原理

构建时generate+tsc，不连接数据库；运行镜像只运行dist和生产依赖。Prisma CLI是devDependency，因此迁移用独立含CLI的镜像target，不能在prune后的runtime里假定CLI可用。应用启动不自动执行migration，避免扩容时每个副本抢DDL。

Compose depends_on只表示启动先后；MySQL必须健康才能运行迁移，应用仍需连接失败/重试与readiness。参考 [Compose启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)、[多阶段构建](https://docs.docker.com/build/building/multi-stage/)、[Prisma生产迁移](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)。迁移需要扩展→双版本兼容→回填→收缩的发布策略，应用回滚不等于数据库回滚。

## 4. 实现前准备

本地Docker引擎29.6.1/Compose5.3.0已只读核实，镜像/DB/Redis未部署。实施前选择Node24.18.0 Debian bookworm同一CPU/ABI镜像、MySQL8.4稳定补丁、Redis8稳定补丁，核实可拉取/安全更新后固定digest，并记录tech-stack。以下NODE_IMAGE/MYSQL_IMAGE/REDIS_IMAGE必须填为验证过的image@sha256值，不编造digest。

生产准备域名/HTTPS终止、受控内网/防火墙、外部Secret注入、runtime与migrator账号、持久卷/对象存储、备份介质。RPO（最多允许丢多少时间数据）、RTO（恢复时间）、保留周期和告警接收渠道待用户确认；未定不能宣称生产可运营。

## 5. 详细实施步骤

### 5.1 创建可构建的镜像阶段

- 目标：Prisma/原生模块在目标Linux安装，启动不需要开发工具。
- 文件：后续新建 `project/Dockerfile`、`project/.dockerignore`；修改package build/运维脚本。
- 操作：.dockerignore排除node_modules、dist、.test-dist、coverage、src/generated、.env/.env.*、.secrets、上传数据和.git；不排除schema/migrations/prisma7.config.ts。核心Dockerfile如下，构建上下文为project/。

```dockerfile
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
RUN npm install --global pnpm@11.13.1
COPY . .
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL=mysql://build:build@127.0.0.1:3306/build_only pnpm run build

FROM build AS migrate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy", "--config", "prisma7.config.ts"]

FROM build AS prod-deps
RUN pnpm prune --prod

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- 解释：虚构build URL仅满足CLI配置读取，generate不做连接；不传真实数据库Secret给docker build。pnpm的依赖构建脚本策略须显式允许经审阅的Prisma/Argon2所需包并入库，不能全局允许任意依赖脚本。原生模块若无目标平台预编译包，在build安装编译工具，不能在runtime临时编译。build前CI已测试；runtime不含CLI，migrate target保留CLI/源码/迁移。
- 命令：环境变量先填实际digest，再 `docker build --build-arg NODE_IMAGE="$NODE_IMAGE" --target runtime -t init-xue-api:候选版本 .` 和target migrate同样构建；检查image内容不含.env/Secrets，目标Linux运行Argon2/JWT/Prisma smoke。
- 预期/验证：非root可启动dist；generate产物和所有生产依赖齐全；本机macOS的node_modules未复制；无Secret进入层或build args。

### 5.2 建立开发Compose与数据库账号

- 目标：启动依赖且不误用root运行应用。
- 文件：新建 `project/compose.yaml`、`.env.compose.example`、Redis配置；账户详细记录维护在 `doc/10-deployment/mysql-accounts.md`（实施时按实际账户补建）。真实`.env.compose`/`.secrets/`忽略。
- 操作：Compose最小服务骨架如下，补完本节配置后方可执行。此片段是本地开发起点，Redis无密码仅允许隔离开发网络；生产按5.3改ACL/TLS。

```yaml
name: init-xue
services:
  mysql:
    image: ${MYSQL_IMAGE:?set_verified_image_digest}
    environment:
      MYSQL_DATABASE: init_xue_dev
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
    secrets: [mysql_root_password]
    volumes: [mysql_data:/var/lib/mysql]
    healthcheck:
      test: [CMD-SHELL, 'mysqladmin ping -h 127.0.0.1 --silent']
      interval: 5s
      timeout: 3s
      retries: 20
  redis:
    image: ${REDIS_IMAGE:?set_verified_image_digest}
    command: [redis-server, --appendonly, 'yes']
    volumes: [redis_data:/data]
  migrate:
    profiles: [ops]
    build:
      context: .
      target: migrate
      args: { NODE_IMAGE: '${NODE_IMAGE:?set_verified_image_digest}' }
    environment:
      DATABASE_URL: ${MIGRATION_DATABASE_URL:?set_migrator_url}
    depends_on:
      mysql: { condition: service_healthy }
  app:
    build:
      context: .
      target: runtime
      args: { NODE_IMAGE: '${NODE_IMAGE:?set_verified_image_digest}' }
    environment:
      NODE_ENV: production
      HOST: '0.0.0.0'
      PORT: '3000'
      DATABASE_URL: ${APP_DATABASE_URL:?set_runtime_url}
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET:?set_runtime_secret}
      JWT_ISSUER: init-xue-api
      JWT_AUDIENCE: init-xue-client
      AUTH_LIMIT_HMAC_SECRET: ${AUTH_LIMIT_HMAC_SECRET:?set_runtime_secret}
      AUTH_REGISTER_ENABLED: 'false'
      AUTH_RESET_ENABLED: 'false'
      OBSERVE_ENABLED: 'false'
      SWAGGER_ENABLED: 'false'
      CACHE_ENABLED: 'true'
      RATE_LIMIT_ENABLED: 'true'
      SCHEDULE_ENABLED: 'false'
      UPLOAD_ENABLED: 'false'
    ports: ['127.0.0.1:3000:3000']
    depends_on:
      mysql: { condition: service_healthy }
      redis: { condition: service_started }
    init: true
    stop_grace_period: 30s
    healthcheck:
      test: [CMD, node, -e, 'fetch("http://127.0.0.1:3000/api/v1/health/live").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))']
      interval: 15s
      timeout: 3s
      retries: 3
secrets:
  mysql_root_password:
    file: ./.secrets/mysql_root_password
volumes:
  mysql_data:
  redis_data:
```

- 数据库账户：mysqladmin ping只检查进程应答，不能证明应用凭据有效。首次用root交互登录，确认空开发库后设置utf8mb4/UTC并创建`app_user`、`migrator`独立强密码；app_user仅SELECT/INSERT/UPDATE/DELETE，audit表在08后例外只SELECT/INSERT；migrator仅本库所需DML和CREATE/ALTER/DROP/INDEX/REFERENCES。开发shadow另建测试库并给专门权限，不给生产runtime CREATE权限。密码不写在版本化SQL，交互输入/可信Secret脚本处理。
- URL：APP_DATABASE_URL连接app_user@mysql:3306/init_xue_dev，MIGRATION_DATABASE_URL连接migrator相同库；宿主机直接运行app若要访问依赖才加`127.0.0.1`端口映射并把URL主机改为127.0.0.1，不能混用容器内localhost与宿主机地址。
- 命令（后续用户执行）：先在本机建立权限受限的Secret文件、填写真实.env.compose，再 `docker compose --env-file .env.compose config --quiet`（不要输出已展开的秘密），`docker compose --env-file .env.compose up -d mysql redis`；随后交互创建账户、核实权限。不要把docker卷首次初始化和重复启动混为一谈，已有卷不会重跑初始化。
- 预期/验证：DB/Redis只在内部网络；账户可连接且权限最小；mysql镜像服务健康后实际SQL查询也成功；不使用 `down -v`清理未知数据卷。

### 5.3 配置生产Secrets、网络与持久化

- 目标：把开发起点变成明确受控的发布环境。
- 文件：新增生产Compose override或部署清单，更新env校验/Secret loader（若使用_FILE）、反向代理/Redis配置及运维文档。
- 操作：生产不提交.env.compose，改用平台Secret环境注入或受限挂载文件。应用若采用`*_FILE`必须在ConfigModule前显式读取并校验，不能假定Nest自动支持；MySQL镜像的_FILE与应用支持不是一回事。Redis采用ACL最小Key/命令权限和TLS，配置/ACL从Secret文件挂载，不把密码放进进程参数。DB adapter ssl使用可信CA验证服务端证书，禁止rejectUnauthorized:false。
- 应用：HTTPS反向代理，明确trust proxy与CORS；非root/read_only/cap_drop/no-new-privileges，只有tmp/上传卷可写；配置CPU/内存/文件大小/连接池/停止宽限。上传和数据库有持久卷且纳入备份；app不挂root密码、不持有migrator URL。日志stdout，Docker/平台设置大小与轮转限制。
- 命令：构建镜像检查、非root/只读根目录smoke、TLS证书与网络访问测试，验证runtime做DDL被拒绝。Secrets可读性由部署系统核实，不在日志打印。
- 预期/验证：关闭Swagger/公开注册/未实现reset；没有公网DB/Redis；远程依赖TLS可验证，密钥轮换流程有演练。

### 5.4 一次性迁移、种子、发布与回滚

- 目标：迁移在放流量前完成，失败可止损。
- 文件：发布runbook/流水线、已有迁移/种子脚本、版本记录，应用源码按前期阶段已实现。
- 操作顺序：确认目标库与备份→审阅迁移SQL/锁表成本→备份成功→唯一migrate作业使用迁移凭据→显式幂等RBAC seed→首次才运行安全bootstrap-admin→启动/滚动替换app→ready通过→关键业务smoke→逐步流量→观察。
- 命令（上述Compose定义存在且已正确配置后）：

```bash
docker compose --env-file .env.compose --profile ops build migrate app
docker compose --env-file .env.compose --profile ops run --rm migrate
docker compose --env-file .env.compose --profile ops run --rm migrate pnpm run rbac:seed
docker compose --env-file .env.compose up -d app
curl -i http://127.0.0.1:3000/api/v1/health/ready
```

- 解释：rbac:seed是06实施时需创建并测试的package脚本，本次不存在。bootstrap-admin同理，仅首次人工受控执行且不在命令参数写密码。不能先启动app再等它每次自动迁移；迁移失败不继续发布。
- 回滚：记录上一个应用镜像digest、配置版本、Schema兼容范围；新增可空列/表时保留数据库结构回退应用。删除列/改变语义需先经过兼容期，不能直接回应用；需要数据库恢复时暂停写入、说明数据丢失窗口、验证备份并获得确认，再在隔离库恢复/切换。migrate deploy没有自动down脚本；resolve只用于已诊断迁移状态，不是强制跳过失败的万能按钮。
- 预期/验证：迁移作业只执行一次；失败没有后续放流量；旧镜像回滚和前向修复各有适用条件。版本/迁移/验证记录更新changelog，不虚报零停机。

### 5.5 备份恢复、监控与值守

- 目标：备份能恢复，故障能发现。
- 文件：新增运维备份/恢复runbook、监控告警配置、演练记录（均放doc/10-deployment下）。
- 备份：使用专用backup账户，凭据放受限defaults-extra-file；MySQL逻辑全备可用`mysqldump --defaults-extra-file=/受限路径/backup.cnf --single-transaction --routines --triggers --events --set-gtid-purged=OFF init_xue_dev > /安全备份路径/backup.sql`。路径/库名/GTID策略按真实部署替换；`--single-transaction`仅保证InnoDB一致快照，备份期间避免DDL。加密、异地保存、校验hash、保留与过期策略，失败必须报警。
- 恢复：先建**新隔离恢复库**，核实目标后使用mysql客户端导入备份，再检查表数/关键行数/外键/迁移版本、登录/权限/软删/会话行为；记录耗时和实际RPO/RTO。生产切换/覆盖是破坏性操作，必须另获确认。文件/对象存储与DB元数据也要可一致恢复；Redis缓存可重建，计数丢失意味着限流窗口重置要记录。
- 监控：HTTP5xx/延迟p95、登录失败/429、依赖503、DB连接池/慢查询/磁盘、Redis内存/淘汰/连接、磁盘/内存/重启、备份最后成功时间/恢复时长。初始阈值如5分钟5xx>1%、p95>500ms只是待压测基线；配置持续窗口、抑制、恢复通知与owner。
- 命令：隔离环境演练DB断连/Redis断连/备份失败，核实live/ready、报警和恢复；本次代理不向任何真实渠道发送消息。
- 预期/验证：不仅“文件存在”，而是新库成功恢复与业务smoke通过；告警有人负责且有处理runbook。

## 6. 数据库设计

不新增业务表，使用02/05/06/08的迁移链。生产MySQL默认UTC/utf8mb4/InnoDB；runtime、migrator、backup、maintenance权限分离。migrate部署前备份并评估长事务/索引创建锁表；迁移历史与镜像绑定。清空卷、DROP、TRUNCATE、reset不作为常规发布步骤。

## 7. API 设计

无新增业务端点。容器内部探针：GET `/api/v1/health/live` 200，readiness GET `/api/v1/health/ready` 200/503，按08约定；公开API只经HTTPS网关。监控详细信息不通过公开health返回。发布smoke使用隔离/专用账号，至少验证登录200→受控管理端点权限→退出后401，不在日志写token。

## 8. 验收标准

- [ ] 镜像固定digest、目标Linux/CPU原生模块可用、无Secret、非root运行。
- [ ] MySQL/Redis权限/网络/TLS/持久卷和日志轮转符合环境要求。
- [ ] 独立migration镜像与单次作业可执行，seed明确，app不带DDL凭据。
- [ ] CI产物发布、readiness/关闭排空/关键smoke通过；回滚兼容性有证据。
- [ ] 隔离新库真实恢复成功，记录备份校验/恢复耗时/实际RPO/RTO。
- [ ] 告警演练有效、owner/runbook明确，生产域名/Secrets/备份策略已确认。

验收记录：未执行；部署目标、镜像digest、RPO/RTO和告警渠道待确认。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| runtime找不到prisma CLI | devDependency已prune，使用独立migrate target |
| Docker build找不到DATABASE_URL | generate会加载CLI配置，构建只给非Secret占位URL，不连接生产 |
| 容器localhost连不上DB | 容器应用URL应使用mysql service名，不是宿主localhost |
| depends_on后连接仍失败 | service_started不等ready；健康检查与真实账户登录分别验证 |
| 首次环境变量改了但旧库账户不变 | 已有卷不会重跑初始化，不删卷，显式评审账户变更 |
| 回滚旧应用仍报Schema错误 | 数据库变更不兼容，按expand/contract或前向修复，不自动drop |

## 10. 后续扩展

业务规模增长再选托管数据库、主从/高可用、蓝绿发布、指标平台、镜像签名/SBOM、基础设施即代码。每次迭代更新原阶段、架构/依赖/迁移/API和changelog，按文档驱动规范继续维护。
