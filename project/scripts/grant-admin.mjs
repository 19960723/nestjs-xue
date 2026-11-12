import { createRequire } from 'node:module';

const require = createRequire(import.meta.resolve('@prisma/adapter-mariadb'));
const mariadb = require('mariadb');

const username = process.argv[2];
if (!username) {
  throw new Error(
    '用法: node --env-file=.env scripts/grant-admin.mjs <username>',
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('缺少 DATABASE_URL');
}

const url = new URL(databaseUrl);
const pool = mariadb.createPool({
  host: url.hostname,
  port: url.port === '' ? 3306 : Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  connectionLimit: 1,
  allowPublicKeyRetrieval: true,
});

async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    throw new Error(
      `${error.errno ?? error.code} ${error.sqlMessage ?? error.message}`,
    );
  }
}

try {
  const users = await query(
    'SELECT id FROM users WHERE username = ? AND status = 1 AND deleted_at IS NULL',
    [username],
  );
  if (users.length !== 1) {
    throw new Error('用户不存在或未启用');
  }
  const roles = await query(
    'SELECT id FROM roles WHERE code = ? AND is_system = 1 AND status = 1',
    ['admin'],
  );
  if (roles.length !== 1) {
    throw new Error('系统角色 admin 不存在，请先执行种子');
  }
  const userId = Number(users[0].id);
  const roleId = Number(roles[0].id);
  const linked = await query(
    'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, roleId],
  );
  if (linked.length === 0) {
    await query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      roleId,
    ]);
    console.log('granted');
  } else {
    console.log('already');
  }
} finally {
  await pool.end();
}
