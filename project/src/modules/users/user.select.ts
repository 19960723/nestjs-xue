import { Prisma } from '../../generated/prisma/client.js';

/** 用户接口公开字段，不包含密码、删除时间和角色关联。 */
export const userPublicSelect = {
  id: true,
  username: true,
  nickname: true,
  avatar: true,
  email: true,
  phone: true,
  sex: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
