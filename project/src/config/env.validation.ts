import type { LogLevel } from '@nestjs/common';
import { parseMysqlDatabaseUrl } from '../database/prisma/database-options.js';

// 同时用于配置枚举校验和启动日志过滤，顺序为从严重到详细。
export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const satisfies readonly LogLevel[];

/** 校验后的配置类型：PORT/布尔开关已转换为数字/布尔值。 */
export interface Environment extends Record<string, unknown> {
  NODE_ENV: 'development' | 'test' | 'production';
  HOST: '127.0.0.1' | '0.0.0.0';
  PORT: number;
  LOG_LEVEL: LogLevel;
  OBSERVE_ENABLED: boolean;
  OBSERVE_APP_KEY?: string;
  OBSERVE_APP_SECRET?: string;
  SWAGGER_ENABLE: boolean;
  SWAGGER_PATH: string;
  DATABASE_URL: string;
}

const REMOVED_DATABASE_KEYS = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USERNAME',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
] as const;

function enumValue<T extends string>(
  name: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    // 错误只列键名与允许值，不回显可能包含敏感内容的原始输入。
    throw new Error(`${name} 必须是 ${allowed.join(' / ')} 之一`);
  }
  return value as T;
}

/** ConfigModule 的校验入口；抛错会阻止启动，不在此建立外部服务连接。 */
export function validateEnv(env: Record<string, unknown>): Environment {
  // 先要求完整数字文本再转换，拒绝 3000junk、科学计数法和超出范围的端口。
  const portText = String(env.PORT ?? '3000');
  const port = Number(portText);
  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('PORT 必须是 1..65535 的整数');
  }
  const nodeEnv = enumValue('NODE_ENV', env.NODE_ENV ?? 'development', [
    'development',
    'test',
    'production',
  ]);
  const host = enumValue('HOST', env.HOST ?? '127.0.0.1', [
    '127.0.0.1',
    '0.0.0.0',
  ]);
  const logLevel = enumValue('LOG_LEVEL', env.LOG_LEVEL ?? 'log', LOG_LEVELS);
  // 必须显式比较字面量，避免 Boolean('false') 也得到 true。
  const observeEnabled =
    enumValue('OBSERVE_ENABLED', env.OBSERVE_ENABLED ?? 'false', [
      'true',
      'false',
    ]) === 'true';

  // Observe 为可选能力；仅在启用时要求凭据，默认本地启动不依赖它。
  for (const key of ['OBSERVE_APP_KEY', 'OBSERVE_APP_SECRET'] as const) {
    if (observeEnabled && (typeof env[key] !== 'string' || !env[key].trim())) {
      throw new Error(`${key} 在 OBSERVE_ENABLED=true 时必填`);
    }
  }

  // Swagger 默认关闭；路径允许缺省，但显式传入时必须是非空字符串。
  const swaggerEnable =
    enumValue('SWAGGER_ENABLE', env.SWAGGER_ENABLE ?? 'false', [
      'true',
      'false',
    ]) === 'true';
  const swaggerPathRaw = env.SWAGGER_PATH ?? 'api/docs';
  if (typeof swaggerPathRaw !== 'string' || !swaggerPathRaw.trim()) {
    throw new Error('SWAGGER_PATH 必须是非空字符串');
  }
  const swaggerPath = swaggerPathRaw.trim();

  if (typeof env.DATABASE_URL !== 'string' || !env.DATABASE_URL.trim()) {
    throw new Error('DATABASE_URL 必填');
  }
  const databaseUrl = env.DATABASE_URL.trim();
  parseMysqlDatabaseUrl(databaseUrl);

  for (const key of REMOVED_DATABASE_KEYS) {
    if (env[key] !== undefined) {
      throw new Error(`${key} 已停用，请只配置 DATABASE_URL`);
    }
  }

  return {
    NODE_ENV: nodeEnv,
    HOST: host,
    PORT: port,
    LOG_LEVEL: logLevel,
    OBSERVE_ENABLED: observeEnabled,
    OBSERVE_APP_KEY:
      typeof env.OBSERVE_APP_KEY === 'string' && env.OBSERVE_APP_KEY.trim()
        ? env.OBSERVE_APP_KEY
        : undefined,
    OBSERVE_APP_SECRET:
      typeof env.OBSERVE_APP_SECRET === 'string' &&
      env.OBSERVE_APP_SECRET.trim()
        ? env.OBSERVE_APP_SECRET
        : undefined,
    SWAGGER_ENABLE: swaggerEnable,
    SWAGGER_PATH: swaggerPath,
    DATABASE_URL: databaseUrl,
  };
}
