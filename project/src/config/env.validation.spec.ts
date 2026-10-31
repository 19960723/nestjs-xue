import { validateEnv } from './env.validation.js';

const VALID_DATABASE_URL =
  'mysql://app_user:replace_me@127.0.0.1:3306/init_xue_dev';

function envWithDb(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { DATABASE_URL: VALID_DATABASE_URL, ...overrides };
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

  it('does not keep unknown env keys on the validated object', () => {
    const result = validateEnv(envWithDb({ UNRELATED: '1' }));
    expect(result).not.toHaveProperty('UNRELATED');
  });
});
