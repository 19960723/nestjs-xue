import base from './jest.config.mjs';

// 只加载校验过的测试库环境。缺少或指向开发库时，用例启动前失败。
export default {
  ...base,
  testTimeout: 60000,
  setupFiles: [
    ...base.setupFiles,
    '<rootDir>/.test-dist/test/setup-integration-env.js',
  ],
  // Windows 上从项目根扫描时会漏掉点开头的 .test-dist，所以根直接指向编译结果。
  roots: ['<rootDir>/.test-dist/test'],
  testMatch: ['**/*.integration-spec.js'],
  coverageDirectory: 'coverage/integration',
};
