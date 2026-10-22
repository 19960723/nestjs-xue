// 公共配置默认匹配单测，E2E/integration 配置导入后覆盖测试范围。
export default {
  testEnvironment: 'node',
  // TypeScript 已预编译并保留装饰器元数据，Jest 不再执行第二次转换。
  transform: {},
  setupFiles: ['reflect-metadata'],
  // 只运行编译出的 JS；修改 TS 后需重新执行 test:compile。
  testMatch: ['<rootDir>/.test-dist/src/**/*.spec.js'],
  coverageProvider: 'v8',
  coverageDirectory: 'coverage/unit',
  collectCoverageFrom: [
    '.test-dist/src/**/*.js',
    '!.test-dist/src/**/*.spec.js',
    '!.test-dist/src/generated/**',
  ],
};
