import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/** 存活探针：仅表明 HTTP 应用可响应；数据库/Redis 就绪检查由后续阶段实现。 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get('live')
  @ApiOperation({ summary: '检查 HTTP 应用存活状态' })
  @ApiOkResponse({
    description:
      'HTTP 应用可响应，不代表数据库或 Redis 已就绪；成功时由全局拦截器包装，data.status=ok',
  })
  live(): { status: 'ok' } {
    // 固定响应，不输出环境、凭据或内部连接状态。
    return { status: 'ok' };
  }
}
