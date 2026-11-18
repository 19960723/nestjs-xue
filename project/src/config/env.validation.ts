import type { LogLevel } from '@nestjs/common';
import path from 'node:path';
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
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_ACCESS_TTL_SECONDS: number;
  REFRESH_TTL_SECONDS: number;
  SESSION_MAX_TTL_SECONDS: number;
  AUTH_LIMIT_HMAC_SECRET: string;
  AUTH_ACCOUNT_MAX_ATTEMPTS: number;
  AUTH_ACCOUNT_WINDOW_SECONDS: number;
  AUTH_IP_MAX_ATTEMPTS: number;
  AUTH_IP_WINDOW_SECONDS: number;
  /** 同一套接字地址的全局限流次数。 */
  RATE_LIMIT_MAX: number;
  /** 全局限流固定窗口，单位秒。 */
  RATE_LIMIT_WINDOW_SECONDS: number;
  REDIS_URL: string;
  /** 允许的浏览器来源。空数组表示不回写跨域响应头。 */
  CORS_ORIGINS: string[];
  /** JSON 请求体上限，单位字节。 */
  JSON_BODY_LIMIT_BYTES: number;
  /** 信任的反向代理跳数。null 表示不信任 X-Forwarded-*。 */
  TRUSTED_PROXY: number | null;
  /** 为 true 时本进程每小时清理一批过期数据。默认关闭。 */
  SCHEDULE_ENABLED: boolean;
  /** 为 true 时才注册上传和下载路由。默认关闭。 */
  UPLOAD_ENABLED: boolean;
  /** 单个上传文件的字节上限。 */
  UPLOAD_MAX_BYTES: number;
  /** 上传根目录。关闭上传时为 null。 */
  UPLOAD_ROOT: string | null;
}

const MIN_JWT_SECRET_LENGTH = 32;
const JWT_ACCESS_TTL_DEFAULT = 900;
const JWT_ACCESS_TTL_MAX = 86400;
const REFRESH_TTL_DEFAULT = 604800;
const REFRESH_TTL_MAX = 2592000;
const SESSION_MAX_TTL_DEFAULT = 2592000;
const SESSION_MAX_TTL_MAX = 2592000;
const AUTH_ACCOUNT_MAX_DEFAULT = 10;
const AUTH_ACCOUNT_MAX_LIMIT = 1000;
const AUTH_ACCOUNT_WINDOW_DEFAULT = 900;
const AUTH_ACCOUNT_WINDOW_MAX = 86400;
const AUTH_IP_MAX_DEFAULT = 60;
const AUTH_IP_MAX_LIMIT = 10000;
const AUTH_IP_WINDOW_DEFAULT = 60;
const AUTH_IP_WINDOW_MAX = 3600;
const RATE_LIMIT_MAX_DEFAULT = 120;
const RATE_LIMIT_MAX_LIMIT = 10000;
const RATE_LIMIT_WINDOW_DEFAULT = 60;
const RATE_LIMIT_WINDOW_MAX = 3600;
const JSON_BODY_LIMIT_DEFAULT = 1_048_576;
const JSON_BODY_LIMIT_MIN = 1024;
const JSON_BODY_LIMIT_MAX = 1_048_576;
const CORS_ORIGIN_LIMIT = 20;
const UPLOAD_MAX_BYTES_DEFAULT = 5_242_880;
const UPLOAD_MAX_BYTES_LIMIT = 5_242_880;

const REMOVED_DATABASE_KEYS = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USERNAME',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
] as const;

function requiredText(name: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} 必须是非空字符串`);
  }
  return value.trim();
}

function requireSecret(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < MIN_JWT_SECRET_LENGTH
  ) {
    throw new Error(
      `${name} 必须是至少 ${MIN_JWT_SECRET_LENGTH} 个字符的非空字符串`,
    );
  }
  return value;
}

function requireJwtSecret(value: unknown): string {
  return requireSecret('JWT_SECRET', value);
}

function boundedInt(
  name: string,
  value: unknown,
  fallback: number,
  max: number,
): number {
  const text = value === undefined ? String(fallback) : String(value);
  const parsed = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > max
  ) {
    throw new Error(`${name} 必须是 1..${max} 的整数`);
  }
  return parsed;
}

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

  const jwtSecret = requireJwtSecret(env.JWT_SECRET);
  const jwtIssuer = requiredText('JWT_ISSUER', env.JWT_ISSUER);
  const jwtAudience = requiredText('JWT_AUDIENCE', env.JWT_AUDIENCE);
  const accessTtl = boundedInt(
    'JWT_ACCESS_TTL_SECONDS',
    env.JWT_ACCESS_TTL_SECONDS,
    JWT_ACCESS_TTL_DEFAULT,
    JWT_ACCESS_TTL_MAX,
  );
  const refreshTtl = boundedInt(
    'REFRESH_TTL_SECONDS',
    env.REFRESH_TTL_SECONDS,
    REFRESH_TTL_DEFAULT,
    REFRESH_TTL_MAX,
  );
  if (accessTtl >= refreshTtl) {
    throw new Error('JWT_ACCESS_TTL_SECONDS 必须小于 REFRESH_TTL_SECONDS');
  }
  const sessionMaxTtl = boundedInt(
    'SESSION_MAX_TTL_SECONDS',
    env.SESSION_MAX_TTL_SECONDS,
    SESSION_MAX_TTL_DEFAULT,
    SESSION_MAX_TTL_MAX,
  );
  if (sessionMaxTtl < refreshTtl) {
    throw new Error(
      'SESSION_MAX_TTL_SECONDS 必须大于或等于 REFRESH_TTL_SECONDS',
    );
  }
  const authLimitSecret = requireSecret(
    'AUTH_LIMIT_HMAC_SECRET',
    env.AUTH_LIMIT_HMAC_SECRET,
  );
  const accountMaxAttempts = boundedInt(
    'AUTH_ACCOUNT_MAX_ATTEMPTS',
    env.AUTH_ACCOUNT_MAX_ATTEMPTS,
    AUTH_ACCOUNT_MAX_DEFAULT,
    AUTH_ACCOUNT_MAX_LIMIT,
  );
  const accountWindowSeconds = boundedInt(
    'AUTH_ACCOUNT_WINDOW_SECONDS',
    env.AUTH_ACCOUNT_WINDOW_SECONDS,
    AUTH_ACCOUNT_WINDOW_DEFAULT,
    AUTH_ACCOUNT_WINDOW_MAX,
  );
  const ipMaxAttempts = boundedInt(
    'AUTH_IP_MAX_ATTEMPTS',
    env.AUTH_IP_MAX_ATTEMPTS,
    AUTH_IP_MAX_DEFAULT,
    AUTH_IP_MAX_LIMIT,
  );
  const ipWindowSeconds = boundedInt(
    'AUTH_IP_WINDOW_SECONDS',
    env.AUTH_IP_WINDOW_SECONDS,
    AUTH_IP_WINDOW_DEFAULT,
    AUTH_IP_WINDOW_MAX,
  );
  const rateLimitMax = boundedInt(
    'RATE_LIMIT_MAX',
    env.RATE_LIMIT_MAX,
    RATE_LIMIT_MAX_DEFAULT,
    RATE_LIMIT_MAX_LIMIT,
  );
  const rateLimitWindowSeconds = boundedInt(
    'RATE_LIMIT_WINDOW_SECONDS',
    env.RATE_LIMIT_WINDOW_SECONDS,
    RATE_LIMIT_WINDOW_DEFAULT,
    RATE_LIMIT_WINDOW_MAX,
  );
  const redisUrl = requireRedisUrl(env.REDIS_URL);
  const corsOrigins = requireCorsOrigins(env.CORS_ORIGINS);
  const jsonBodyLimit = boundedInt(
    'JSON_BODY_LIMIT_BYTES',
    env.JSON_BODY_LIMIT_BYTES,
    JSON_BODY_LIMIT_DEFAULT,
    JSON_BODY_LIMIT_MAX,
  );
  if (jsonBodyLimit < JSON_BODY_LIMIT_MIN) {
    throw new Error(
      `JSON_BODY_LIMIT_BYTES 必须是 ${JSON_BODY_LIMIT_MIN}..${JSON_BODY_LIMIT_MAX} 的整数`,
    );
  }
  const trustedProxy = requireTrustedProxy(env.TRUSTED_PROXY);
  const scheduleEnabled =
    enumValue('SCHEDULE_ENABLED', env.SCHEDULE_ENABLED ?? 'false', [
      'true',
      'false',
    ]) === 'true';
  const uploadEnabled =
    enumValue('UPLOAD_ENABLED', env.UPLOAD_ENABLED ?? 'false', [
      'true',
      'false',
    ]) === 'true';
  const uploadMaxBytes = requireUploadMax(env.UPLOAD_MAX_BYTES);
  const uploadRoot = requireUploadRoot(env.UPLOAD_ROOT, uploadEnabled);

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
    JWT_SECRET: jwtSecret,
    JWT_ISSUER: jwtIssuer,
    JWT_AUDIENCE: jwtAudience,
    JWT_ACCESS_TTL_SECONDS: accessTtl,
    REFRESH_TTL_SECONDS: refreshTtl,
    SESSION_MAX_TTL_SECONDS: sessionMaxTtl,
    AUTH_LIMIT_HMAC_SECRET: authLimitSecret,
    AUTH_ACCOUNT_MAX_ATTEMPTS: accountMaxAttempts,
    AUTH_ACCOUNT_WINDOW_SECONDS: accountWindowSeconds,
    AUTH_IP_MAX_ATTEMPTS: ipMaxAttempts,
    AUTH_IP_WINDOW_SECONDS: ipWindowSeconds,
    RATE_LIMIT_MAX: rateLimitMax,
    RATE_LIMIT_WINDOW_SECONDS: rateLimitWindowSeconds,
    REDIS_URL: redisUrl,
    CORS_ORIGINS: corsOrigins,
    JSON_BODY_LIMIT_BYTES: jsonBodyLimit,
    TRUSTED_PROXY: trustedProxy,
    SCHEDULE_ENABLED: scheduleEnabled,
    UPLOAD_ENABLED: uploadEnabled,
    UPLOAD_MAX_BYTES: uploadMaxBytes,
    UPLOAD_ROOT: uploadRoot,
  };
}

/** 只接受 redis 或 rediss。错误文案不回显地址，避免带出密码。 */
function requireRedisUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('REDIS_URL 必填');
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('REDIS_URL 格式无效');
  }
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL 协议必须是 redis 或 rediss');
  }
  if (parsed.hostname === '') {
    throw new Error('REDIS_URL 缺少主机');
  }
  return value.trim();
}

/** 只接受逗号分隔的 http/https 来源。空值表示不开放跨域，不接受通配。 */
function requireCorsOrigins(value: unknown): string[] {
  if (value === undefined || value === '') {
    return [];
  }
  if (typeof value !== 'string') {
    throw new Error('CORS_ORIGINS 格式无效');
  }
  const origins: string[] = [];
  for (const item of value.split(',')) {
    const origin = item.trim();
    if (origin === '' || origin === '*') {
      throw new Error('CORS_ORIGINS 不能为空或通配');
    }
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS 含有无效来源');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('CORS_ORIGINS 协议必须是 http 或 https');
    }
    if (
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error('CORS_ORIGINS 只能是协议、主机和端口');
    }
    if (origins.includes(url.origin)) {
      throw new Error('CORS_ORIGINS 含有重复来源');
    }
    origins.push(url.origin);
  }
  if (origins.length > CORS_ORIGIN_LIMIT) {
    throw new Error(`CORS_ORIGINS 最多 ${CORS_ORIGIN_LIMIT} 个来源`);
  }
  return origins;
}

/** 只接受 1..5 的代理跳数。不填表示不信任转发头，登录来源仍看套接字地址。 */
function requireTrustedProxy(value: unknown): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !/^[1-5]$/.test(value)) {
    throw new Error('TRUSTED_PROXY 必须是 1..5 的跳数');
  }
  return Number(value);
}

/** 上传体积上限。缺省 5MiB，不允许超过 5MiB。 */
function requireUploadMax(value: unknown): number {
  if (value === undefined || value === '') {
    return UPLOAD_MAX_BYTES_DEFAULT;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new Error(
      `UPLOAD_MAX_BYTES 必须是 1..${UPLOAD_MAX_BYTES_LIMIT} 的整数`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > UPLOAD_MAX_BYTES_LIMIT) {
    throw new Error(
      `UPLOAD_MAX_BYTES 必须是 1..${UPLOAD_MAX_BYTES_LIMIT} 的整数`,
    );
  }
  return parsed;
}

/**
 * 关闭上传时不要求目录。打开时必须是项目目录之外的绝对路径。
 * 错误不回显路径。
 */
function requireUploadRoot(value: unknown, enabled: boolean): string | null {
  if (!enabled) {
    return null;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('UPLOAD_ROOT 在 UPLOAD_ENABLED=true 时必填');
  }
  const root = path.resolve(value.trim());
  if (!path.isAbsolute(value.trim()) || root === path.parse(root).root) {
    throw new Error('UPLOAD_ROOT 必须是项目目录之外的绝对路径');
  }
  const project = path.resolve(process.cwd());
  if (root === project || root.startsWith(`${project}${path.sep}`)) {
    throw new Error('UPLOAD_ROOT 必须是项目目录之外的绝对路径');
  }
  return root;
}
