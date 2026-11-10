import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** 全局数据库模块。业务模块直接注入 PrismaService，不在这里注册查询。 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
