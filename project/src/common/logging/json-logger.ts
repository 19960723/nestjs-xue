import type { LogLevel, LoggerService } from '@nestjs/common';
import { currentRequestId } from '../request-context.service.js';

export interface JsonLogEntry {
  time: string;
  level: LogLevel;
  context: string;
  requestId: string;
  event: string;
  message: string;
  duration?: number;
  status?: number;
  method?: string;
  path?: string;
  stack?: string;
  actorUserId?: number;
}

/**
 * 进程内唯一的 JSON 日志出口。一行一个对象，写到标准输出。
 * 不序列化整个错误对象，堆栈里的数据库和 Redis 地址会被抹掉。
 */
export function writeJsonLog(entry: JsonLogEntry): void {
  const line = {
    time: entry.time,
    level: entry.level,
    context: entry.context,
    requestId: entry.requestId,
    event: entry.event,
    message: redact(entry.message),
    ...(entry.duration === undefined ? {} : { duration: entry.duration }),
    ...(entry.status === undefined ? {} : { status: entry.status }),
    ...(entry.method === undefined ? {} : { method: entry.method }),
    ...(entry.path === undefined ? {} : { path: entry.path }),
    ...(entry.stack === undefined ? {} : { stack: redact(entry.stack) }),
    ...(entry.actorUserId === undefined
      ? {}
      : { actorUserId: entry.actorUserId }),
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

/** Nest 日志适配。只接收字符串，忽略可能带上请求体或配置的对象参数。 */
export class JsonLogger implements LoggerService {
  constructor(private readonly levels: readonly LogLevel[]) {}

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, stackOrContext?: unknown, context?: unknown): void {
    let stack: string | undefined;
    let resolvedContext: string | undefined;
    if (typeof context === 'string') {
      resolvedContext = context;
      if (typeof stackOrContext === 'string') {
        stack = stackOrContext;
      }
    } else if (
      typeof stackOrContext === 'string' &&
      stackOrContext.includes('\n')
    ) {
      stack = stackOrContext;
    } else if (typeof stackOrContext === 'string') {
      resolvedContext = stackOrContext;
    }
    this.write('error', message, resolvedContext, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    if (!this.levels.includes(level)) {
      return;
    }
    writeJsonLog({
      time: new Date().toISOString(),
      level,
      context: context && context.length > 0 ? context : 'App',
      requestId: currentRequestId(),
      event: 'app.log',
      message: typeof message === 'string' ? message : '非文本日志已省略',
      ...(stack === undefined ? {} : { stack }),
    });
  }
}

function redact(text: string): string {
  return text
    .replace(/mysql:\/\/\S+/gi, 'mysql://redacted')
    .replace(/postgres:\/\/\S+/gi, 'postgres://redacted')
    .replace(/rediss:\/\/\S+/gi, 'rediss://redacted')
    .replace(/redis:\/\/\S+/gi, 'redis://redacted');
}
