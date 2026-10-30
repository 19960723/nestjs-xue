import { Prisma } from '../../generated/prisma/client.js';

/** 角色接口公开字段，不包含用户关联。 */
export const rolePublicSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  status: true,
  sort: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RoleSelect;
