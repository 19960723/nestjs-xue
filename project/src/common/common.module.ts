import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { ResponseInterceptor } from './interceptors/response.interceptor.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';
import { RequestContextService } from './request-context.service.js';

/**
 * 公共请求管线。注册 requestId、全局异常过滤器和成功响应包装。
 * 中间件覆盖全部路由，业务模块不再各自包装响应。
 */
@Module({
  providers: [
    RequestContextService,
    RequestContextMiddleware,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
  exports: [RequestContextService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
