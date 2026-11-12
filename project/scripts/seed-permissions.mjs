import { createRequire } from 'node:module';

const require = createRequire(import.meta.resolve('@prisma/adapter-mariadb'));
const mariadb = require('mariadb');

const PERMISSIONS = [
  ['users:create', '新增用户'],
  ['users:read', '查看用户'],
  ['users:update', '修改用户'],
  ['users:delete', '删除用户'],
  ['users:assign-roles', '分配用户角色'],
  ['roles:read', '查看角色'],
  ['roles:write', '管理角色'],
  ['permissions:read', '查看权限'],
];

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
  connectionLimit: 2,
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

async function ensurePermission(code, name) {
  const existing = await query('SELECT id FROM permissions WHERE code = ?', [
    code,
  ]);
  if (existing.length > 0) {
    return Number(existing[0].id);
  }
  const inserted = await query(
    'INSERT INTO permissions (name, code, type, status, updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP(3))',
    [name, code, 'API'],
  );
  return Number(inserted.insertId);
}

async function ensureSystemRole(code, name) {
  const existing = await query(
    'SELECT id, code, is_system FROM roles WHERE code = ?',
    [code],
  );
  if (existing.length === 0) {
    const inserted = await query(
      'INSERT INTO roles (name, code, status, is_system) VALUES (?, ?, 1, 1)',
      [name, code],
    );
    return { id: Number(inserted.insertId), created: true };
  }

  const id = Number(existing[0].id);
  if (Number(existing[0].is_system) === 1) {
    return { id, created: false };
  }

  const holders = await query(
    'SELECT COUNT(*) AS total FROM user_roles WHERE role_id = ?',
    [id],
  );
  const links = await query(
    'SELECT COUNT(*) AS total FROM role_permissions WHERE role_id = ?',
    [id],
  );
  if (Number(holders[0].total) !== 0 || Number(links[0].total) !== 0) {
    throw new Error(`角色 ${existing[0].code} 已有关联，种子停止`);
  }

  await query('UPDATE roles SET is_system = 1 WHERE id = ? AND is_system = 0', [
    id,
  ]);
  console.log(`adopted ${existing[0].code}`);
  return { id, created: false };
}

try {
  const permissionIds = [];
  for (const [code, name] of PERMISSIONS) {
    permissionIds.push(await ensurePermission(code, name));
  }

  const admin = await ensureSystemRole('admin', '管理员');
  const member = await ensureSystemRole('member', '成员');

  await query('DELETE FROM role_permissions WHERE role_id = ?', [admin.id]);
  for (const permissionId of permissionIds) {
    await query(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
      [admin.id, permissionId],
    );
  }
  if (member.created) {
    await query('DELETE FROM role_permissions WHERE role_id = ?', [member.id]);
  }

  const permissionCount = await query(
    'SELECT COUNT(*) AS total FROM permissions',
  );
  const adminLinks = await query(
    'SELECT COUNT(*) AS total FROM role_permissions WHERE role_id = ?',
    [admin.id],
  );
  const memberLinks = await query(
    'SELECT COUNT(*) AS total FROM role_permissions WHERE role_id = ?',
    [member.id],
  );
  console.log(
    `permissions ${Number(permissionCount[0].total)} admin-links ${Number(adminLinks[0].total)} member-links ${Number(memberLinks[0].total)}`,
  );
} finally {
  await pool.end();
}
