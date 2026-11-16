import { validateEnv } from './env.validation.js';

const VALID_DATABASE_URL =
  'mysql://app_user:replace_me@127.0.0.1:3306/init_xue_dev';
const VALID_JWT_SECRET = 'test-only-jwt-secret-32chars-minimum';

function envWithDb(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    DATABASE_URL: VALID_DATABASE_URL,
    JWT_SECRET: VALID_JWT_SECRET,
    JWT_ISSUER: 'init-xue',
    JWT_AUDIENCE: 'init-xue-api',
    AUTH_LIMIT_HMAC_SECRET: VALID_JWT_SECRET,
    REDIS_URL: 'redis://127.0.0.1:6379',
    ...overrides,
  };
}

// 直接测试配置转换与拒绝规则，不加载 .env 或启动 Nest 应用。
describe('validateEnv', () => {
  it('defaults to local development with Observe disabled', () => {
    expect(validateEnv(envWithDb())).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'log',
      OBSERVE_ENABLED: false,
      DATABASE_URL: VALID_DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      JWT_ISSUER: 'init-xue',
      JWT_AUDIENCE: 'init-xue-api',
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TTL_SECONDS: 604800,
      SESSION_MAX_TTL_SECONDS: 2592000,
      AUTH_LIMIT_HMAC_SECRET: VALID_JWT_SECRET,
      AUTH_ACCOUNT_MAX_ATTEMPTS: 10,
      AUTH_ACCOUNT_WINDOW_SECONDS: 900,
      AUTH_IP_MAX_ATTEMPTS: 60,
      AUTH_IP_WINDOW_SECONDS: 60,
      REDIS_URL: 'redis://127.0.0.1:6379',
      SCHEDULE_ENABLED: false,
      UPLOAD_ENABLED: false,
      UPLOAD_MAX_BYTES: 5_242_880,
      UPLOAD_ROOT: null,
    });
  });

  it.each(['1', '3000', '65535'])('normalizes valid PORT=%s', (port) => {
    expect(validateEnv(envWithDb({ PORT: port })).PORT).toBe(Number(port));
  });

  it.each([
    '',
    '0',
    '65536',
    '-1',
    '3.5',
    '3000junk',
    ' 3000',
    '1e3',
    'Infinity',
  ])('rejects invalid PORT=%s', (port) => {
    expect(() => validateEnv(envWithDb({ PORT: port }))).toThrow('PORT');
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['HOST', 'localhost'],
    ['LOG_LEVEL', 'trace'],
    ['OBSERVE_ENABLED', '1'],
    ['OBSERVE_ENABLED', 'TRUE'],
    ['OBSERVE_ENABLED', ''],
  ])('rejects invalid %s', (key, value) => {
    expect(() => validateEnv(envWithDb({ [key]: value }))).toThrow(key);
  });

  it.each(['OBSERVE_APP_KEY', 'OBSERVE_APP_SECRET'])(
    'requires %s when Observe is enabled',
    (key) => {
      const env = envWithDb({
        OBSERVE_ENABLED: 'true',
        OBSERVE_APP_KEY: 'test-key',
        OBSERVE_APP_SECRET: 'test-secret',
        [key]: '  ',
      });
      expect(() => validateEnv(env)).toThrow(key);
    },
  );

  it('accepts explicit production configuration and enabled Observe', () => {
    expect(
      validateEnv(
        envWithDb({
          NODE_ENV: 'production',
          HOST: '0.0.0.0',
          PORT: '8080',
          LOG_LEVEL: 'warn',
          OBSERVE_ENABLED: 'true',
          OBSERVE_APP_KEY: 'test-key',
          OBSERVE_APP_SECRET: 'test-secret',
        }),
      ),
    ).toMatchObject({ PORT: 8080, OBSERVE_ENABLED: true });
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow('DATABASE_URL');
  });

  it.each([
    'postgres://app_user:replace_me@127.0.0.1:5432/init_xue_dev',
    'mysql://app_user:replace_me@127.0.0.1:3306/',
    'mysql://app_user:replace_me@127.0.0.1:3306/init_xue_dev?ssl=true',
    'not-a-url',
  ])('rejects invalid DATABASE_URL shape', (databaseUrl) => {
    expect(() => validateEnv({ DATABASE_URL: databaseUrl })).toThrow(
      'DATABASE_URL',
    );
  });

  it('does not echo rejected values in configuration errors', () => {
    expect(() =>
      validateEnv(envWithDb({ NODE_ENV: 'private-marker' })),
    ).toThrow(/^NODE_ENV 必须是 development \/ test \/ production 之一$/);
  });

  it('does not echo DATABASE_URL secrets in configuration errors', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL:
          'postgres://app_user:secret-marker@127.0.0.1:5432/init_xue_dev',
      }),
    ).toThrow(/^DATABASE_URL 协议必须是 mysql$/);
  });

  it('rejects a REDIS_URL that is missing or uses another protocol', () => {
    expect(() => validateEnv(envWithDb({ REDIS_URL: '' }))).toThrow(
      'REDIS_URL 必填',
    );
    expect(() =>
      validateEnv(
        envWithDb({
          REDIS_URL: 'http://user:secret-marker@127.0.0.1:6379',
        }),
      ),
    ).toThrow(/^REDIS_URL 协议必须是 redis 或 rediss$/);
  });

  it('rejects wildcard CORS origins and an out-of-range proxy hop', () => {
    expect(validateEnv(envWithDb())).toMatchObject({
      CORS_ORIGINS: [],
      JSON_BODY_LIMIT_BYTES: 1_048_576,
      TRUSTED_PROXY: null,
    });
    expect(() =>
      validateEnv(
        envWithDb({ CORS_ORIGINS: 'https://user:secret-marker@example.com' }),
      ),
    ).toThrow(/^CORS_ORIGINS 只能是协议、主机和端口$/);
    expect(() => validateEnv(envWithDb({ TRUSTED_PROXY: '9' }))).toThrow(
      'TRUSTED_PROXY 必须是 1..5 的跳数',
    );
    expect(
      validateEnv(envWithDb({ SCHEDULE_ENABLED: 'true' })).SCHEDULE_ENABLED,
    ).toBe(true);
    expect(() => validateEnv(envWithDb({ SCHEDULE_ENABLED: 'yes' }))).toThrow(
      'SCHEDULE_ENABLED 必须是 true / false 之一',
    );
    expect(() => validateEnv(envWithDb({ UPLOAD_ENABLED: 'true' }))).toThrow(
      'UPLOAD_ROOT 在 UPLOAD_ENABLED=true 时必填',
    );
    expect(
      validateEnv(
        envWithDb({
          UPLOAD_ENABLED: 'true',
          UPLOAD_ROOT: '/tmp/init-xue-upload',
        }),
      ).UPLOAD_ROOT,
    ).toBe('/tmp/init-xue-upload');
    expect(() =>
      validateEnv(
        envWithDb({
          UPLOAD_ENABLED: 'true',
          UPLOAD_ROOT: 'relative/uploads',
        }),
      ),
    ).toThrow('UPLOAD_ROOT 必须是项目目录之外的绝对路径');
  });

  it.each([
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_USERNAME',
    'DATABASE_PASSWORD',
    'DATABASE_NAME',
  ])('rejects removed %s', (key) => {
    expect(() => validateEnv(envWithDb({ [key]: 'leftover' }))).toThrow(
      `${key} 已停用，请只配置 DATABASE_URL`,
    );
  });

  it('rejects missing JWT_SECRET', () => {
    const env = envWithDb();
    delete env.JWT_SECRET;
    expect(() => validateEnv(env)).toThrow(
      /^JWT_SECRET 必须是至少 32 个字符的非空字符串$/,
    );
  });

  it('does not echo a short JWT_SECRET', () => {
    expect(() =>
      validateEnv(envWithDb({ JWT_SECRET: 'secret-marker' })),
    ).toThrow(/^JWT_SECRET 必须是至少 32 个字符的非空字符串$/);
  });

  it.each(['JWT_ISSUER', 'JWT_AUDIENCE'])('rejects blank %s', (key) => {
    expect(() => validateEnv(envWithDb({ [key]: '  ' }))).toThrow(
      `${key} 必须是非空字符串`,
    );
  });

  it.each(['0', '-1', '1.5', '86401', '900junk'])(
    'rejects invalid JWT_ACCESS_TTL_SECONDS=%s',
    (value) => {
      expect(() =>
        validateEnv(envWithDb({ JWT_ACCESS_TTL_SECONDS: value })),
      ).toThrow('JWT_ACCESS_TTL_SECONDS');
    },
  );

  it('rejects access TTL that is not shorter than refresh TTL', () => {
    expect(() =>
      validateEnv(
        envWithDb({
          JWT_ACCESS_TTL_SECONDS: '900',
          REFRESH_TTL_SECONDS: '900',
        }),
      ),
    ).toThrow('JWT_ACCESS_TTL_SECONDS 必须小于 REFRESH_TTL_SECONDS');
  });

  it('rejects a missing login limit secret without echoing it', () => {
    expect(() =>
      validateEnv(envWithDb({ AUTH_LIMIT_HMAC_SECRET: 'secret-marker' })),
    ).toThrow(/^AUTH_LIMIT_HMAC_SECRET 必须是至少 32 个字符的非空字符串$/);
  });

  it('rejects a session cap shorter than the refresh TTL', () => {
    expect(() =>
      validateEnv(
        envWithDb({
          REFRESH_TTL_SECONDS: '604800',
          SESSION_MAX_TTL_SECONDS: '604799',
        }),
      ),
    ).toThrow('SESSION_MAX_TTL_SECONDS 必须大于或等于 REFRESH_TTL_SECONDS');
  });

  it('does not keep unknown env keys on the validated object', () => {
    const result = validateEnv(envWithDb({ UNRELATED: '1' }));
    expect(result).not.toHaveProperty('UNRELATED');
  });
});
