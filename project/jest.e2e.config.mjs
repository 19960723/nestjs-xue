import base from './jest.config.mjs';

export default {
  ...base,
  // 加载测试环境后再执行 HTTP 测试，隔离个人配置与真实遥测。
  setupFiles: [...base.setupFiles, '<rootDir>/.test-dist/test/setup-env.js'],
  testMatch: ['<rootDir>/.test-dist/test/**/*.e2e-spec.js'],
  coverageDirectory: 'coverage/e2e',
};
