import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * 声明访问路由所需的全部权限码。多项必须同时具备。
 * 空列表会在启动时失败，避免把未声明的路由当成公开。
 */
export const RequirePermissions = (...codes: string[]) => {
  if (codes.length === 0 || codes.some((code) => code.trim().length === 0)) {
    throw new Error('RequirePermissions 至少需要一个非空权限码');
  }
  return SetMetadata(PERMISSIONS_KEY, codes);
};
