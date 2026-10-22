import { jest } from '@jest/globals';
import { Module } from '@nestjs/common';
import { createAppModule } from './app.module.js';

// 用最小替身验证组装接线，避免测试初始化真实 SDK 或发送遥测。
@Module({})
class TestObserveModule {}

const sdkLoaded = jest.fn();
const forRoot = jest.fn(() => ({ module: TestObserveModule }));
const instrument = { instanceDecorator: (instance: unknown) => instance };

// 被测工厂会动态 import SDK；记录替身加载时机以验证开关与校验顺序。
jest.unstable_mockModule('@nestjs/observe', () => {
  sdkLoaded();
  return {
    createObserveModule: () => ({
      ObserveModule: { forRoot },
      ObserveInstrument: instrument,
    }),
  };
});

describe('application configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 每个用例使用独立环境；afterEach 恢复原对象，不影响其他测试。
    jest.replaceProperty(process, 'env', { NODE_ENV: 'test' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not load the Observe SDK when disabled', async () => {
    const { appModule, appOptions } = await createAppModule();
    expect(appModule.imports).toHaveLength(1);
    expect(appOptions.instrument).toBeUndefined();
    expect(sdkLoaded).not.toHaveBeenCalled();
    expect(forRoot).not.toHaveBeenCalled();
  });

  it('rejects missing credentials before loading the SDK', async () => {
    process.env.OBSERVE_ENABLED = 'true';
    await expect(createAppModule()).rejects.toThrow('OBSERVE_APP_KEY');
    expect(sdkLoaded).not.toHaveBeenCalled();
  });

  it('registers the module and matching instrument after validation', async () => {
    process.env.OBSERVE_ENABLED = 'true';
    process.env.OBSERVE_APP_KEY = 'test-key';
    process.env.OBSERVE_APP_SECRET = 'test-secret';
    process.env.LOG_LEVEL = 'warn';
    const { appModule, appOptions } = await createAppModule();
    expect(appModule.imports).toHaveLength(2);
    expect(forRoot).toHaveBeenCalledWith(
      expect.objectContaining({ appKey: 'test-key', appSecret: 'test-secret' }),
    );
    expect(appOptions.instrument).toBe(instrument);
    expect(appOptions.logger).toEqual(['fatal', 'error', 'warn']);
  });
});
