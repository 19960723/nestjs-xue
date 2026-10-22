// 由 Jest setupFiles 先于测试文件执行；NODE_ENV=test 使配置工厂跳过个人 .env。
process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '3000';
process.env.LOG_LEVEL = 'fatal';
// 禁用遥测并移除继承的凭据，保证测试不连接真实 Observe。
process.env.OBSERVE_ENABLED = 'false';
delete process.env.OBSERVE_APP_KEY;
delete process.env.OBSERVE_APP_SECRET;
