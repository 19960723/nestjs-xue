import { Controller, Get } from '@nestjs/common';

/** 存活探针：仅表明 HTTP 应用可响应；数据库/Redis 就绪检查由后续阶段实现。 */
@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'ok' } {
    // 固定响应，不输出环境、凭据或内部连接状态。
    return { status: 'ok' };
  }
}
