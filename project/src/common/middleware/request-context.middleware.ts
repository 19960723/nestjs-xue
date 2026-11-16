import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { LOG_LEVELS } from '../../config/env.validation.js';
import type { Environment } from '../../config/env.validation.js';
import { writeJsonLog } from '../logging/json-logger.js';
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
 * 为每个请求确定 requestId，并在响应结束或连接中断时记一条 JSON 访问日志。
 * 路径不含查询串，不记录请求头和正文。finish 与 close 都可能触发，用 finished 保证只记一次。
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', requestId);

    const startedAt = Date.now();
    let finished = false;

    const logCompletion = (aborted: boolean): void => {
      if (!this.accessLogEnabled()) {
        return;
      }
      const duration = Date.now() - startedAt;
      writeJsonLog({
        time: new Date().toISOString(),
        level: 'log',
        context: 'HTTP',
        requestId,
        event: aborted ? 'http.aborted' : 'http.completed',
        message: aborted ? '客户端中断' : '请求完成',
        duration,
        method: req.method,
        path: req.path.slice(0, 200),
        ...(aborted ? {} : { status: res.statusCode }),
      });
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

  /** 与启动日志使用同一组级别。error 及更严时不写普通访问日志。 */
  private accessLogEnabled(): boolean {
    const selected = this.config.get('LOG_LEVEL', { infer: true });
    const enabled = LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(selected) + 1);
    return enabled.includes('log');
  }
}
