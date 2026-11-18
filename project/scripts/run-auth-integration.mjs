import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);
const TEST_DATABASE_NAME = /^init_xue_test_[a-z0-9]+$/;

function redact(text) {
  return String(text).replace(/mysql:\/\/\S+/gi, 'mysql://***');
}

function fail(message) {
  console.error(redact(message));
  process.exit(1);
}

function readSourceDatabaseUrl() {
  if (process.env.DATABASE_URL?.startsWith('mysql:')) {
    return process.env.DATABASE_URL;
  }
  let raw;
  try {
    raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  } catch {
    fail('缺少 DATABASE_URL，无法派生测试库');
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (
      separator < 0 ||
      trimmed.slice(0, separator).trim() !== 'DATABASE_URL'
    ) {
      continue;
    }
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value.startsWith('mysql:')) {
      fail('DATABASE_URL 协议必须是 mysql');
    }
    return value;
  }
  fail('缺少 DATABASE_URL，无法派生测试库');
}

function parseMysqlUrl(value, databasePattern) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('数据库地址格式不合法');
  }
  if (url.protocol !== 'mysql:' || !ALLOWED_HOSTS.has(url.hostname)) {
    fail('数据库主机不在白名单');
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!databaseName || databaseName.includes('/')) {
    fail('数据库名无效');
  }
  if (databasePattern && !databasePattern.test(databaseName)) {
    fail('测试库名必须匹配 init_xue_test_<runid>');
  }
  return { url, databaseName };
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => {
      process.stdout.write(redact(chunk.toString()));
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(redact(chunk.toString()));
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

const explicitTestUrl = process.env.TEST_DATABASE_URL;
const runId = Date.now().toString(36);
const databaseName = explicitTestUrl
  ? parseMysqlUrl(explicitTestUrl, TEST_DATABASE_NAME).databaseName
  : `init_xue_test_${runId}`;
const sourceUrl = explicitTestUrl ?? readSourceDatabaseUrl();
const source = parseMysqlUrl(sourceUrl);
if (source.databaseName === databaseName && !explicitTestUrl) {
  fail('测试库名与来源库相同，已停止');
}

const testUrl = new URL(source.url.toString());
testUrl.pathname = `/${databaseName}`;
testUrl.search = '';
testUrl.hash = '';
parseMysqlUrl(testUrl.toString(), TEST_DATABASE_NAME);

const require = createRequire(import.meta.resolve('@prisma/adapter-mariadb'));
const mariadb = require('mariadb');
const pool = mariadb.createPool({
  host: source.url.hostname,
  port: source.url.port === '' ? 3306 : Number(source.url.port),
  user: decodeURIComponent(source.url.username),
  password: decodeURIComponent(source.url.password),
  database: source.databaseName,
  connectionLimit: 1,
  allowPublicKeyRetrieval: true,
});

try {
  await pool.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
} catch (error) {
  fail(`创建测试库失败：${error.code ?? error.errno ?? 'unknown'}`);
} finally {
  await pool.end();
}

console.log(`测试库已准备：主机 ${source.url.hostname}，库名 ${databaseName}`);

const testEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testUrl.toString(),
  TEST_DATABASE_URL: testUrl.toString(),
  REDIS_URL: 'redis://127.0.0.1:6379',
  HOST: '127.0.0.1',
  PORT: '3001',
  LOG_LEVEL: 'fatal',
  OBSERVE_ENABLED: 'false',
  SWAGGER_ENABLE: 'false',
  SCHEDULE_ENABLED: 'false',
  UPLOAD_ENABLED: 'false',
  JWT_SECRET: 'test-only-jwt-secret-32chars-minimum',
  JWT_ISSUER: 'init-xue',
  JWT_AUDIENCE: 'init-xue-api',
  AUTH_LIMIT_HMAC_SECRET: 'test-only-jwt-secret-32chars-minimum',
};
delete testEnv.OBSERVE_APP_KEY;
delete testEnv.OBSERVE_APP_SECRET;
delete testEnv.SHADOW_DATABASE_URL;

const migrated = await run(
  process.execPath,
  [
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
    '--config',
    'prisma7.config.ts',
  ],
  testEnv,
);
if (migrated !== 0) {
  process.exit(migrated);
}

const seeded = await run(
  process.execPath,
  ['scripts/seed-permissions.mjs'],
  testEnv,
);
if (seeded !== 0) {
  process.exit(seeded);
}

const tested = await run(
  process.execPath,
  ['--run', 'test:integration'],
  testEnv,
);
process.exit(tested);
