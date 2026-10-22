import base from './jest.config.mjs';

// 当前仅预留入口；接入数据库/Redis 用例前须补齐专用测试环境与清理保护。
export default {
  ...base,
  setupFiles: [...base.setupFiles, '<rootDir>/.test-dist/test/setup-env.js'],
  testMatch: ['<rootDir>/.test-dist/test/**/*.integration-spec.js'],
  coverageDirectory: 'coverage/integration',
};
