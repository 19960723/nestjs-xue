# ADR 0002：Prisma7.10.1、MySQL8.4与原生ESM

- 日期：2026-10-21
- 状态：提议
- 确认记录：当前为文档基线，未安装/运行
- 关联：[阶段02](../02-database/implementation.md)、[技术栈](../00-overview/tech-stack.md)

## 背景与约束

项目已有Nest12/TS6/NodeNext/ESM。用户要求MySQL8.x，旧笔记的prisma-client-js、schema URL和无adapter构造方式与所选Prisma7路径不一致。Prisma8当前官方仍标RC，而且CLI latest可能已指向8。

## 候选方案

| 方案 | 好处 | 成本/兼容性 |
| --- | --- | --- |
| Prisma7 + MariaDb adapter + ESM | 官方MySQL路径，延续现有模块格式 | 需维护CLI配置、生成目录、版本匹配 |
| Prisma6旧生成器 | 旧教程多 | 支持周期和新项目维护成本不合适 |
| Prisma8 RC | 新架构 | 当前API/功能兼容边界变化，不用于此MySQL生产起点 |
| 改CommonJS | 一些旧Nest示例可用 | 不必要改变现有ESM，增加迁移成本 |

## 决定与理由

Prisma CLI/Client/adapter-mariadb精确7.10.1，使用MySQL8.4 LTS。配置prisma7.config.ts，URL供CLI，运行时从同一URL生成PrismaMariaDb参数。prisma-client生成到src/generated/prisma，ESM、TS输出、内部.js导入，tsc编译后Node运行。

## 影响与迁移

保留现有package和代码直到用户实施。build前generate，runtime含生成JS与client生产包；迁移镜像保留CLI。CLI的dotenv和Nest环境加载独立。不得不带版本安装prisma或混入Prisma8命令。TLS/连接池/真实数据库兼容性需阶段02/10执行验收。

## 验证与重新评估

7.10.1三个包已只读核实存在，Node24/TS6满足声明的engines/peers，但尚无完整安装/构建/DB测试。升级Prisma8必须另评估MySQL支持、迁移、错误模型、事务和生成API，不能仅替换版本号。

## 依据

[Prisma发布状态](https://www.prisma.io/docs/orm/release-status)、[MySQL7教程](https://www.prisma.io/docs/v7/prisma-orm/quickstart/mysql)、[生成器](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)，核实于2026-10-21。
