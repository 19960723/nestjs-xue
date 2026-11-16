import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

/** 探针。live 只表示进程还能回答 HTTP；ready 才检查 MySQL 和 Redis。 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** 探针不携带身份。这个方法跳过身份和权限校验。 */
  @Public()
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

  /**
   * 依赖都正常时 data.status 为 ok。任一必需依赖失败返回 503。
   * 响应不区分是数据库还是 Redis，避免把内部状态暴露给探针。
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: '检查 MySQL 和 Redis 是否可接流量' })
  @ApiOkResponse({
    description: 'MySQL 和 Redis 均可响应；成功时 data.status=ok',
  })
  @ApiServiceUnavailableResponse({
    description: '进程正在关闭，或 MySQL、Redis 有一项不可用',
  })
  ready(): Promise<{ status: 'ok' }> {
    return this.health.ready();
  }
}
