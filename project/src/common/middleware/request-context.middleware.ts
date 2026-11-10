import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../request-context.service.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 只沿用符合长度和字符集的 X-Request-Id，其余情况重新生成，避免把超长头写进日志。 */
function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header)) {
    return header;
  }

  return randomUUID();
}

/**
 * 为每个请求确定 requestId，并在响应结束或连接中断时记一条访问日志。
 * finish 与 close 都可能触发，用 finished 保证只记一次。
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', requestId);

    const startedAt = Date.now();
    let finished = false;

    const logCompletion = (aborted: boolean): void => {
      const durationMs = Date.now() - startedAt;
      const path = req.path;
      if (aborted) {
        this.logger.log(
          `${req.method} ${path} aborted ${durationMs}ms requestId=${requestId}`,
        );
        return;
      }

      this.logger.log(
        `${req.method} ${path} ${res.statusCode} ${durationMs}ms requestId=${requestId}`,
      );
    };

    res.on('finish', () => {
      finished = true;
      logCompletion(false);
    });
    res.on('close', () => {
      if (!finished) {
        logCompletion(true);
      }
    });

    this.requestContext.run(requestId, () => {
      next();
    });
  }
}
