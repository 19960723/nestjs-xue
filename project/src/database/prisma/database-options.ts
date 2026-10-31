import { PrismaMariaDb } from '@prisma/adapter-mariadb';

export interface MysqlDatabaseOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** 解析已校验的 MySQL URL；错误只描述规则，不回显连接串。 */
export function parseMysqlDatabaseUrl(
  databaseUrl: string,
): MysqlDatabaseOptions {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL 格式不合法');
  }

  if (url.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL 协议必须是 mysql');
  }
  if (!url.hostname) {
    throw new Error('DATABASE_URL 必须包含主机名');
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error('DATABASE_URL 含有不支持的查询或片段参数');
  }

  const portText = url.port === '' ? '3306' : url.port;
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
    throw new Error('DATABASE_URL 端口必须是 1..65535 的整数');
  }

  const databasePath = url.pathname.startsWith('/')
    ? url.pathname.slice(1)
    : url.pathname;
  if (!databasePath || databasePath.includes('/')) {
    throw new Error('DATABASE_URL 必须包含非空库名');
  }

  return {
    host: url.hostname,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(databasePath),
  };
}

export function createDatabaseAdapter(databaseUrl: string): PrismaMariaDb {
  const options = parseMysqlDatabaseUrl(databaseUrl);
  return new PrismaMariaDb({
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    connectionLimit: 5,
    allowPublicKeyRetrieval: true,
  });
}
