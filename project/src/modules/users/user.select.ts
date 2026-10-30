import { Prisma } from '../../generated/prisma/client.js';

/** 用户接口公开字段，不包含角色关联。 */
export const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  age: true,
  status: true,
  phone: true,
  sex: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
