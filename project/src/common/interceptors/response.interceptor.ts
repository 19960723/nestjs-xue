import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator.js';
import { RequestContextService } from '../request-context.service.js';
import { isApiSuccessEnvelope } from '../types/api-response.js';
import type { ApiSuccessResponse } from '../types/api-response.js';
import { ErrorCode } from '../types/error-code.js';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const requestId = this.requestContext.getRequestId();

    return next.handle().pipe(
      map((data: unknown): ApiSuccessResponse<unknown> => {
        if (isApiSuccessEnvelope(data)) {
          return data;
        }

        return {
          code: ErrorCode.OK,
          message: 'ok',
          data: data === undefined ? null : data,
          requestId,
        };
      }),
    );
  }
}
