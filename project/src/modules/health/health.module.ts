import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// 存活检查没有外部资源依赖，模块只注册 Controller。
@Module({ controllers: [HealthController] })
export class HealthModule {}
