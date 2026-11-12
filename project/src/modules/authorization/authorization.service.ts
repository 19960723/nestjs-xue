import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { rolePublicSelect } from '../roles/role.select.js';

const ADMIN_CODE = 'admin';
const permissionSelect = {
  id: true,
  name: true,
  code: true,
  type: true,
  status: true,
} satisfies Prisma.PermissionSelect;

type Tx = Prisma.TransactionClient;

/**
 * 权限目录和关联替换。
 * 角色权限、用户角色都是整表替换：校验失败时事务回滚，不会留下半套关联。
 * 操作者只能授予自己已经具备的权限。系统管理员角色的权限集只由种子维护。
 * 替换用户角色时锁住 admin 角色行，避免并发把最后一名有效管理员一起拿掉。
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回全部权限目录，按权限码排序。目录由种子写入，这里不提供新增接口。 */
  listPermissions() {
    return this.prisma.permission.findMany({
      select: permissionSelect,
      orderBy: { code: 'asc' },
    });
  }

  /** 返回角色当前挂接的权限。角色不存在时 404。 */
  async listRolePermissions(roleId: number) {
    await this.requireRole(roleId);
    return this.prisma.permission.findMany({
      where: { roles: { some: { roleId } } },
      select: permissionSelect,
      orderBy: { code: 'asc' },
    });
  }

  /**
   * 用传入的权限 ID 替换角色的全部权限。空数组表示清空。
   * 系统角色拒绝修改。停用或不存在的权限视为非法关联。
   */
  async replaceRolePermissions(
    actorId: number,
    roleId: number,
    permissionIds: number[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id: roleId },
        select: { id: true, isSystem: true },
      });
      if (!role) {
        throw new NotFoundException('角色不存在');
      }
      if (role.isSystem) {
        throw new ConflictException('系统角色的权限不能通过接口修改');
      }

      const permissions = await this.requireActivePermissions(
        tx,
        permissionIds,
      );
      const owned = await this.actorPermissionCodes(tx, actorId);
      if (permissions.some((item) => !owned.has(item.code))) {
        throw new ForbiddenException('权限不足');
      }

      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((item) => ({
            roleId,
            permissionId: item.id,
          })),
        });
      }

      return tx.permission.findMany({
        where: { roles: { some: { roleId } } },
        select: permissionSelect,
        orderBy: { code: 'asc' },
      });
    });
  }

  /** 返回用户当前角色。已删除用户按不存在处理。 */
  async listUserRoles(userId: number) {
    await this.requireAssignableUser(this.prisma, userId);
    return this.prisma.role.findMany({
      where: { users: { some: { userId } } },
      select: rolePublicSelect,
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
    });
  }

  /**
   * 用传入的角色 ID 替换用户的全部角色。空数组表示清空。
   * 不能改自己的角色。角色上的启用权限必须都是操作者已具备的。
   */
  async replaceUserRoles(actorId: number, userId: number, roleIds: number[]) {
    if (actorId === userId) {
      throw new ForbiddenException('不能修改自己的角色');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockAdminRole(tx);
      const user = await this.requireAssignableUser(tx, userId);
      if (user.status !== 1) {
        throw new ConflictException('用户已禁用');
      }

      const roles = await this.requireActiveRoles(tx, roleIds);
      const granted = await this.permissionCodesOfRoles(
        tx,
        roles.map((role) => role.id),
      );
      const owned = await this.actorPermissionCodes(tx, actorId);
      if (granted.some((code) => !owned.has(code))) {
        throw new ForbiddenException('权限不足');
      }

      await this.ensureRemainingAdmin(
        tx,
        userId,
        roles.map((role) => role.id),
      );

      await tx.userRole.deleteMany({ where: { userId } });
      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId, roleId: role.id })),
        });
      }

      return tx.role.findMany({
        where: { users: { some: { userId } } },
        select: rolePublicSelect,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
      });
    });
  }

  private async requireRole(roleId: number): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
  }

  /** 已删除用户返回 404，避免把删除状态暴露成另一种结果。 */
  private async requireAssignableUser(db: PrismaService | Tx, userId: number) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  private async requireActivePermissions(tx: Tx, permissionIds: number[]) {
    if (permissionIds.length === 0) {
      return [];
    }
    const permissions = await tx.permission.findMany({
      where: { id: { in: permissionIds }, status: 1 },
      select: { id: true, code: true },
    });
    if (permissions.length !== permissionIds.length) {
      throw new NotFoundException('权限不存在或已停用');
    }
    return permissions;
  }

  private async requireActiveRoles(tx: Tx, roleIds: number[]) {
    if (roleIds.length === 0) {
      return [];
    }
    const roles = await tx.role.findMany({
      where: { id: { in: roleIds }, status: 1 },
      select: { id: true, code: true, isSystem: true },
    });
    if (roles.length !== roleIds.length) {
      throw new NotFoundException('角色不存在或已停用');
    }
    return roles;
  }

  /** 操作者经启用角色实际拥有的权限码。停用权限和停用角色不算。 */
  private async actorPermissionCodes(tx: Tx, actorId: number) {
    const rows = await tx.permission.findMany({
      where: {
        status: 1,
        roles: {
          some: {
            role: {
              status: 1,
              users: {
                some: {
                  userId: actorId,
                  user: { deletedAt: null, status: 1 },
                },
              },
            },
          },
        },
      },
      select: { code: true },
    });
    return new Set(rows.map((row) => row.code));
  }

  /** 这些角色上当前启用的权限码。角色尚未启用的权限不参与本次授予判断。 */
  private async permissionCodesOfRoles(tx: Tx, roleIds: number[]) {
    if (roleIds.length === 0) {
      return [];
    }
    const rows = await tx.permission.findMany({
      where: {
        status: 1,
        roles: { some: { roleId: { in: roleIds } } },
      },
      select: { code: true },
    });
    return rows.map((row) => row.code);
  }

  /** 锁住系统管理员角色，让并发的角色替换按同一顺序等待。 */
  private async lockAdminRole(tx: Tx): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM roles WHERE code = ${ADMIN_CODE} AND is_system = 1 FOR UPDATE
    `;
  }

  /** 拿掉目标用户的 admin 后，还要留下至少一名启用且未删除的管理员。 */
  private async ensureRemainingAdmin(
    tx: Tx,
    userId: number,
    nextRoleIds: number[],
  ): Promise<void> {
    const admin = await tx.role.findUnique({
      where: { code: ADMIN_CODE },
      select: { id: true, isSystem: true, status: true },
    });
    if (!admin?.isSystem || admin.status !== 1) {
      return;
    }
    const current = await tx.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: admin.id } },
    });
    if (!current || nextRoleIds.includes(admin.id)) {
      return;
    }

    const others = await tx.userRole.count({
      where: {
        roleId: admin.id,
        userId: { not: userId },
        user: { deletedAt: null, status: 1 },
      },
    });
    if (others < 1) {
      throw new ConflictException('必须保留至少一名有效管理员');
    }
  }
}
