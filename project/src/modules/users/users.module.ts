import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

/**
 * 用户模块。导入 AuthModule 只为复用 PasswordService，不在这里签发令牌。
 * RedisModule 只提供详情展示缓存，不在这里保存会话或权限。
 */
@Module({
  imports: [AuthModule, RedisModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
