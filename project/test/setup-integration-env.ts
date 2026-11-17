// 集成测试在导入应用前执行。只接受已指向隔离库的 TEST_DATABASE_URL，不读取个人 .env。
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);
const TEST_DATABASE_NAME = /^init_xue_test_[a-z0-9]+$/;

function stop(message: string): never {
  throw new Error(message);
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  stop('缺少 TEST_DATABASE_URL');
}

let url: URL;
try {
  url = new URL(testDatabaseUrl);
} catch {
  stop('TEST_DATABASE_URL 格式不合法');
}

if (url.protocol !== 'mysql:') {
  stop('TEST_DATABASE_URL 协议必须是 mysql');
}
if (!ALLOWED_HOSTS.has(url.hostname)) {
  stop('TEST_DATABASE_URL 主机不在白名单');
}
if (url.search !== '' || url.hash !== '') {
  stop('TEST_DATABASE_URL 含有不支持的查询或片段参数');
}

const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!TEST_DATABASE_NAME.test(databaseName)) {
  stop('测试库名必须匹配 init_xue_test_<runid>');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.HOST = '127.0.0.1';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'fatal';
process.env.OBSERVE_ENABLED = 'false';
delete process.env.OBSERVE_APP_KEY;
delete process.env.OBSERVE_APP_SECRET;
process.env.SWAGGER_ENABLE = 'false';
process.env.SCHEDULE_ENABLED = 'false';
process.env.UPLOAD_ENABLED = 'false';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.JWT_SECRET = 'test-only-jwt-secret-32chars-minimum';
process.env.JWT_ISSUER = 'init-xue';
process.env.JWT_AUDIENCE = 'init-xue-api';
process.env.AUTH_LIMIT_HMAC_SECRET = 'test-only-jwt-secret-32chars-minimum';
delete process.env.SHADOW_DATABASE_URL;
