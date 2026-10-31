import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../request-context.service.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header)) {
    return header;
  }

  return randomUUID();
}

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
