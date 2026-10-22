import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

// 保留模板问候入口；空路径与共用前缀/版本组合后对应 GET /api/v1。
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
