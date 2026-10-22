import { validateEnv } from './env.validation.js';

// 直接测试配置转换与拒绝规则，不加载 .env 或启动 Nest 应用。
describe('validateEnv', () => {
  it('defaults to local development with Observe disabled', () => {
    expect(validateEnv({})).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'log',
      OBSERVE_ENABLED: false,
    });
  });

  it.each(['1', '3000', '65535'])('normalizes valid PORT=%s', (port) => {
    expect(validateEnv({ PORT: port }).PORT).toBe(Number(port));
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
    expect(() => validateEnv({ PORT: port })).toThrow('PORT');
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['HOST', 'localhost'],
    ['LOG_LEVEL', 'trace'],
    ['OBSERVE_ENABLED', '1'],
    ['OBSERVE_ENABLED', 'TRUE'],
    ['OBSERVE_ENABLED', ''],
  ])('rejects invalid %s', (key, value) => {
    expect(() => validateEnv({ [key]: value })).toThrow(key);
  });

  it.each(['OBSERVE_APP_KEY', 'OBSERVE_APP_SECRET'])(
    'requires %s when Observe is enabled',
    (key) => {
      const env = {
        OBSERVE_ENABLED: 'true',
        OBSERVE_APP_KEY: 'test-key',
        OBSERVE_APP_SECRET: 'test-secret',
        [key]: '  ',
      };
      expect(() => validateEnv(env)).toThrow(key);
    },
  );

  it('accepts explicit production configuration and enabled Observe', () => {
    expect(
      validateEnv({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        OBSERVE_ENABLED: 'true',
        OBSERVE_APP_KEY: 'test-key',
        OBSERVE_APP_SECRET: 'test-secret',
      }),
    ).toMatchObject({ PORT: 8080, OBSERVE_ENABLED: true });
  });

  it('does not echo rejected values in configuration errors', () => {
    expect(() => validateEnv({ NODE_ENV: 'private-marker' })).toThrow(
      /^NODE_ENV 必须是 development \/ test \/ production 之一$/,
    );
  });
});
