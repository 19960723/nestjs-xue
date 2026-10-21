# 阶段 07：Redis 与缓存

更新：2026-10-21。文档状态：已编写；功能状态：计划中。前置：[04](../04-user-management/implementation.md)～[06](../06-authorization/implementation.md)。命令默认project/。

## 1. 阶段目标

接入一个受控Redis客户端，提供展示资料缓存、提交后失效、跨实例限流、故障降级和关闭流程。用户状态、会话撤销、权限继续以MySQL实时校验为准。

## 2. 功能清单

| 功能名称 | 功能作用 | 优先级 | 前置依赖 | 完成标准 |
| --- | --- | --- | --- | --- |
| RedisModule/连接 | 统一资源管理 | P0 | 配置/Redis服务 | 连接有超时、断连可观察、关闭释放 |
| Key/TTL/封装 | 约束缓存行为 | P0 | ioredis | 单位明确、无永久缓存/敏感字段 |
| 用户缓存 | 减少展示资料重复读 | P1 | public select | 命中/失效/损坏回源可验证 |
| 缓存一致性 | 限制陈旧窗口 | P0 | 数据提交 | 事务后删，失败告警+TTL收敛 |
| 共享限流 | 多副本共同限额 | P0 | 原子Redis操作 | 两实例总配额一致，429有Retry-After |
| 故障策略 | 缓存故障不扩大权限 | P0 | 认证/RBAC | 展示回源，安全限制失败关闭或可靠兜底 |

## 3. 技术原理

采用cache-aside：先读Redis，未命中读MySQL并写短TTL；数据提交后DEL。这个流程存在“旧读在删除后回填”的竞争，因此是有界最终一致，不能用于权限/用户禁用判断。短TTL只限制单个缓存值寿命，不能替代实时授权。

限流需要原子读改写，不能分两次INCR和EXPIRE后宣称崩溃安全；Lua将计数/过期/封禁一次完成。Nest节流器只提供框架集成，默认内存storage不是跨实例共享。参考 [ioredis官方](https://github.com/redis/ioredis)、[Redis SET](https://redis.io/docs/latest/commands/set/)、[Lua EVAL](https://redis.io/docs/latest/commands/eval/)。

## 4. 实现前准备

后续手动安装已核实版本：

```bash
pnpm add --save-exact ioredis@6.0.0 @nestjs/throttler@6.7.1
```

确认Redis稳定8.x正式补丁、镜像digest/托管支持版本，记录到tech-stack；不使用latest或RC镜像。新增REDIS_URL、CACHE_ENABLED、RATE_LIMIT_ENABLED及相关配置校验。开发容器按10创建，端口只绑定127.0.0.1，生产不暴露Redis公网端口，使用ACL/TLS和最小Key权限。Redis不保存唯一会话/权限事实，无需用缓存数据库代替MySQL。

## 5. 详细实施步骤

### 5.1 创建连接与生命周期

- 目标：每进程一个可管理客户端。
- 文件：新建 `project/src/infrastructure/redis/{redis.module,redis.service}.ts`、修改env校验/example和AppModule。
- 操作：配置连接URL、连接/命令超时、有限重试、`maxRetriesPerRequest`和关闭离线排队，防Redis坏了HTTP一直挂起。可用lazyConnect显式连接；订阅error/ready/close生成脱敏事件，不打印URL；onModuleDestroy限时quit，失败disconnect。缓存可选且失败时继续启动；若共享限流被启用为必需，则初始化失败不宣告ready。
- 命令：后续 `pnpm run build`，用受控测试Redis执行PING；不要输出带密码的redis-cli连接串。
- 预期/验证：启动、断连、恢复、SIGTERM均有有限等待和日志，不产生无限重试队列；失败策略与第5.5一致。

### 5.2 定义Key和JSON缓存边界

- 目标：隔离环境、避免单位误用与数据泄漏。
- 文件：新建 `project/src/infrastructure/redis/cache.service.ts`、`cache-key.ts`及单测。
- 操作：Key统一 `init-xue:{env}:v1:{module}:{resource}:{id}`，例如`init-xue:development:v1:users:profile:42`；不拼原文email、token、密码或用户可控无界字符串。getJson返回命中/未命中并校验缓存结构；坏JSON或不符schema按miss并删除。setJson参数明确ttlSeconds，内部 `SET key JSON EX ttlSeconds`；禁止传0/负数/无限TTL。
- TTL：用户展示资料60秒+0～15秒随机抖动；可选不存在缓存5秒但不缓存鉴权失败；不要缓存整个HTTP响应、requestId、Authorization或用户权限。只缓存04的public select，email等PII仍需ACL与必要性审查，不因“公开DTO”就允许对外公开。

```ts
// CacheService方法片段；redis由RedisModule注入
async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
    throw new Error('缓存TTL超出范围');
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('缓存值不可序列化');
  await this.redis.set(key, json, 'EX', ttlSeconds);
}
```

- 读取时 `JSON.parse` 结果先作为unknown，通过对应资料结构检查后才返回，不能`as T`假定外部缓存可信。Key由服务内部builder产生，不接收客户端传入任意Key。
- 命令：单测验证秒单位与TTL界限，集成测试写入后TTL在预期区间。
- 预期/验证：跨环境Key不碰撞，坏数据回源不500，所有缓存都有过期。

### 5.3 接入展示缓存与提交后失效

- 目标：提速但保留安全判断与一致性边界。
- 文件：修改UsersService，新增 `project/src/modules/users/user-profile-cache.service.ts`；UsersModule显式导入RedisModule。
- 操作：只缓存授权已通过后的普通资料读取；AuthGuard/RBAC仍走MySQL。每次详情仍检查未软删/有效可见状态后再使用展示缓存，或者让该读展示最多75秒陈旧并明确产品允许；本方案选择先从DB校验可见性，保证已删用户不从缓存复活。更新/状态/软删事务提交后DEL详情Key；删除失败打指标，禁止为DEL失败回滚已提交DB。
- 一致性：最初不缓存列表；短TTL和提交后DEL仍可能旧读回填，显示字段至多缓存TTL陈旧。需要显示强一致时关闭该缓存，或后续设计版本化key/可靠失效outbox；不能靠“延迟双删”当严格保证。
- 命令：隔离集成测试 miss→命中、更新后失效、软删后404、DEL失败后回源/TTL恢复；测试事务回滚时不删除/不发布错误变更。
- 预期/验证：缓存故障不影响认证权限正确性；失效失败有可观察记录，旧展示值最终过期。

### 5.4 实现共享限流storage

- 目标：同一用户/IP跨副本共享配额。
- 文件：新建 `project/src/infrastructure/redis/redis-throttler.storage.ts`、Lua脚本文件；全局注册ThrottlerGuard/对应storage，修改认证端点策略。
- 操作：先检查**所安装6.7.1**的ThrottlerStorage声明，实现其increment参数和返回结构，不能照搬老版接口。TTL/blockDuration输入为毫秒，storage返回的timeToExpire/timeToBlockExpire按该版本接口的秒语义转换，覆盖契约测试。Lua维护hit和block状态与PEXPIRE并原子判断；Redis Cluster若使用多key必须放相同hash tag。不能使用生产KEYS扫全库。

storage签名为 `increment(key, ttl, limit, blockDuration, throttlerName)`，返回 `{totalHits,timeToExpire,isBlocked,timeToBlockExpire}`。本方案采用**固定窗口**（可能在窗口边界出现双倍突发），不是承诺复刻框架默认滑动窗口。可将下面脚本保存在 `project/src/infrastructure/redis/scripts/rate-limit.lua`，由构建配置复制到dist对应位置，或以字符串模块内嵌避免运行镜像遗漏。

```lua
-- KEYS[1]: 带环境/路由/策略/可信IP摘要的单个hash key
-- ARGV: ttl毫秒、limit、blockDuration毫秒；Node端校验前两者>0，第三者>=0
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local ttl, limit, duration = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local state = redis.call('HMGET', KEYS[1], 'hits', 'windowEnd', 'blockEnd')
local hits = tonumber(state[1]) or 0
local windowEnd = tonumber(state[2]) or 0
local blockEnd = tonumber(state[3]) or 0
local blocked = 0
if blockEnd > now then
  blocked = 1
else
  if now >= windowEnd or (blockEnd > 0 and now >= blockEnd) then
    hits, windowEnd, blockEnd = 0, now + ttl, 0
  end
  if hits >= limit then
    blocked = 1
    if duration > 0 then blockEnd = now + duration end
  else
    hits = hits + 1
  end
end
redis.call('HSET', KEYS[1], 'hits', hits, 'windowEnd', windowEnd, 'blockEnd', blockEnd)
redis.call('PEXPIRE', KEYS[1], math.max(windowEnd, blockEnd) - now)
local wait = 0
if blocked == 1 then wait = (blockEnd > now and blockEnd or windowEnd) - now end
return {hits, math.ceil(math.max(0, windowEnd - now) / 1000), blocked, math.ceil(wait / 1000)}
```

Node storage调用 `redis.eval(script, 1, scopedKey, ttl, limit, blockDuration)`，检查返回是四个非负数字，再映射isBlocked为第三项等于1；代码里的wait在配置blockDuration>0时按blockEnd计算，否则按windowEnd计算，避免夸大Retry-After。传入scopedKey应包括throttlerName，防命名策略互相覆盖；ACL需允许TIME和脚本内部使用的HASH/TTL命令。

- 策略：普通路由按可信IP全局每60秒120次；登录/刷新/重置使用更严格命名策略（如每60秒10次），在昂贵hash/DB前限流。认证后的敏感操作另可按用户id限额。全局Guard最初运行在认证之前，所以默认按IP，不能假定req.user已就绪；若要按用户，显式放在认证后。账号桶仍复用05的MySQL准入，不把可伪造请求body直接当可信身份。
- 命令：运行两个应用实例对同一个Redis并发请求，累计额度超限返回429，检查Retry-After；用FakeClock/短TTL测试毫秒与秒换算及封禁恢复。
- 预期/验证：总额度不会因副本数翻倍；Redis脚本崩溃不留下永不过期Key，超限错误符合03格式。storage真实代码必须按实际包类型编译，此处不虚构第三方storage适配依赖。

### 5.5 演练故障与恢复

- 目标：明确每种依赖故障的用户行为。
- 文件：Redis/cache/throttler测试、08的health readiness集成、部署故障记录。
- 操作：展示缓存故障fail-open回MySQL，但权限从不放开；共享限流Redis故障：本方案普通及认证入口都返回503（存活探针排除），避免失去全局预算引发DB洪峰；05的MySQL账户桶是额外兜底，不宣称能自动替代所有路由的分布式限流。Redis恢复后按需恢复ready，重试有限，切换期允许计数重新开始但记录窗口。
- 命令：在隔离环境短暂停止测试Redis或注入连接故障，再恢复；不停止共享/生产服务。运行缓存与安全接口E2E。
- 预期/验证：仅缓存启用时展示接口仍可回源；启用强制限流时业务503、live200、ready503；没有“Redis坏了因此认证通过”的分支。

## 6. 数据库设计

本阶段不新增MySQL表/迁移，05的attempt桶继续保留。Redis Key/TTL是数据设计的一部分，统一在5.2/5.4维护。缓存可淘汰；限流Key不应因内存淘汰静默消失，生产推荐与可淘汰展示缓存使用独立实例/内存策略；单机学习可共用但需接受并记录其限制，数据库仍负责核心认证准入。

## 7. API 设计

无Redis管理HTTP接口；04用户资料路径和响应不变，新增429/503以及Retry-After。命中状态仅记内部指标，不暴露缓存Key/URL。

| 接口名称 | Method/URL | 请求 | data | 正常码 | 异常码 | 认证/权限 |
| --- | --- | --- | --- | --- | --- | --- |
| 用户详情（缓存展示） | GET /api/v1/users/:id | 正Int id | User | 200 | 400/401/403/404/429/503 | JWT/users:read |
| 登录（共享限流） | POST /api/v1/auth/login | 05的DTO | TokenSet | 200 | 400/401/429/503 | Public+限流 |

测试：对隔离服务连续登录无效fixture，确认429含Retry-After；不要用真正的生产账户尝试触发封禁。通过测试storage和两个实例的E2E断言共享预算，避免在文档写无限curl循环。

## 8. 验收标准

- [ ] 单例连接、TLS/ACL计划、有限重试/关闭和脱敏日志验证。
- [ ] Key规范、秒TTL、坏缓存回源、提交后DEL和失败收敛通过。
- [ ] 权限/会话/软删可见性不由陈旧缓存决定。
- [ ] 两实例共享限流，毫秒/秒、封禁TTL和Retry-After正确。
- [ ] 缓存/安全依赖故障策略、live/ready状态符合约定。

验收记录：未执行；Redis服务/镜像实际版本待实施确认。

## 9. 常见问题

| 症状 | 排查与处理 |
| --- | --- |
| 限流额度变成多倍 | 默认内存storage未替换/不同实例前缀不一致 |
| TTL短1000倍 | 混用throttler毫秒和EX秒；边界契约测试 |
| 断连时请求长期挂起 | 离线排队、重试无限、命令无超时 |
| 更新后偶尔旧显示 | cache-aside回填竞争，接受短TTL窗口或关闭缓存 |
| Redis故障后旧用户能登录 | 安全事实被错误缓存；恢复MySQL权威检查 |

## 10. 后续扩展

[08](../08-common/implementation.md)增加依赖健康/指标/审计；需要高可用时评估哨兵/集群和限流独立实例。只在有实际一致性要求时增加outbox或版本化失效，不预先引入消息队列。
