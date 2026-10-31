import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';
import { RequestContextService } from '../request-context.service.js';
import type {
  ApiErrorResponse,
  ValidationDetail,
} from '../types/api-response.js';
import { ErrorCode } from '../types/error-code.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<unknown>();
    const requestId = this.requestContext.getRequestId();

    const mapped = this.mapException(exception);
    const body: ApiErrorResponse = {
      code: mapped.code,
      message: mapped.message,
      data: null,
      requestId,
      ...(mapped.details ? { details: mapped.details } : {}),
    };

    if (mapped.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const name =
        exception instanceof Error ? exception.constructor.name : 'Unknown';
      this.logger.error(
        `Unhandled error requestId=${requestId} name=${name}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (requestId) {
      httpAdapter.setHeader(response, 'X-Request-Id', requestId);
    }

    httpAdapter.reply(response, body, mapped.status);
  }

  private mapException(exception: unknown): {
    status: number;
    code: ApiErrorResponse['code'];
    message: string;
    details?: ValidationDetail[];
  } {
    if (exception instanceof HttpException) {
      return this.mapHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002' || exception.code === 'P2003') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: '资源冲突',
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: '资源不存在',
        };
      }
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: '服务暂不可用',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: '服务器内部错误',
    };
  }

  private mapHttpException(exception: HttpException): {
    status: number;
    code: ApiErrorResponse['code'];
    message: string;
    details?: ValidationDetail[];
  } {
    const status = exception.getStatus();
    const payload = this.extractHttpPayload(exception);

    return {
      status,
      code: this.codeForStatus(status),
      message: payload.message,
      details: payload.details,
    };
  }

  private extractHttpPayload(exception: HttpException): {
    message: string;
    details?: ValidationDetail[];
  } {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response };
    }

    if (typeof response === 'object' && response !== null) {
      const body = response as Record<string, unknown>;
      if (Array.isArray(body.details)) {
        return {
          message:
            typeof body.message === 'string' ? body.message : '请求参数不合法',
          details: body.details as ValidationDetail[],
        };
      }

      if (Array.isArray(body.message)) {
        return {
          message: '请求参数不合法',
          details: [
            {
              field: 'request',
              messages: body.message.map((item) => String(item)),
            },
          ],
        };
      }

      if (typeof body.message === 'string') {
        return { message: body.message };
      }
    }

    return { message: exception.message };
  }

  private codeForStatus(status: number): ApiErrorResponse['code'] {
    if (status === HttpStatus.BAD_REQUEST) {
      return ErrorCode.VALIDATION_ERROR;
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      return ErrorCode.UNAUTHENTICATED;
    }
    if (status === HttpStatus.FORBIDDEN) {
      return ErrorCode.FORBIDDEN;
    }
    if (status === HttpStatus.NOT_FOUND) {
      return ErrorCode.NOT_FOUND;
    }
    if (status === HttpStatus.CONFLICT) {
      return ErrorCode.CONFLICT;
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return ErrorCode.RATE_LIMITED;
    }
    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return ErrorCode.SERVICE_UNAVAILABLE;
    }
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return ErrorCode.INTERNAL_ERROR;
    }

    return ErrorCode.VALIDATION_ERROR;
  }
}
