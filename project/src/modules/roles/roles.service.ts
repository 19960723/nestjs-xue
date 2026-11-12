import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { QueryRoleDto } from './dto/query-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { rolePublicSelect } from './role.select.js';

/**
 * 角色资料。当前只有 code 唯一，name 可以重复。
 * 写入冲突交给数据库唯一索引，再映射成 409，避免先查再写的并发空窗。
 * 删除前在同一事务里检查是否已分配给用户。
 * 系统角色不能删除、禁用或修改编码，权限集由种子维护。
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 只有 code 有唯一索引，所以 P2002 一律视为编码冲突，不把 name 重复当成约束。 */
  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('角色编码已存在');
    }

    throw error;
  }

  /** 写入角色。编码冲突由唯一索引兜底，经 handleWriteError 变成 409。 */
  async create(createRoleDto: CreateRoleDto) {
    try {
      return await this.prisma.role.create({
        data: {
          name: createRoleDto.name,
          code: createRoleDto.code,
          description: createRoleDto.description,
          status: createRoleDto.status,
          sort: createRoleDto.sort,
        },
        select: rolePublicSelect,
      });
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  /** 分页列表。默认 sort 升序、id 降序；关键字匹配名称或编码，状态按精确值筛选。 */
  async findAll(query: QueryRoleDto) {
    const { page, pageSize, keyword, status } = query;
    const where: Prisma.RoleWhereInput = {};

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }

    if (status !== undefined) {
      where.status = status;
    }

    const [list, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        select: rolePublicSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      list,
      total,
      page,
      pageSize,
    };
  }

  /** 按主键返回公开字段。不存在时 404。 */
  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: rolePublicSelect,
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    return role;
  }

  /** 部分更新。先确认角色存在，编码冲突同样走唯一索引。系统角色拒绝改编码和禁用。 */
  async update(id: number, updateRoleDto: UpdateRoleDto) {
    const current = await this.findOne(id);
    if (current.isSystem) {
      if (
        updateRoleDto.code !== undefined &&
        updateRoleDto.code !== current.code
      ) {
        throw new ConflictException('系统角色不能修改编码');
      }
      if (updateRoleDto.status === 0) {
        throw new ConflictException('系统角色不能禁用');
      }
    }

    try {
      return await this.prisma.role.update({
        where: { id },
        data: {
          name: updateRoleDto.name,
          code: updateRoleDto.code,
          description: updateRoleDto.description,
          status: updateRoleDto.status,
          sort: updateRoleDto.sort,
        },
        select: rolePublicSelect,
      });
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  /** 未分配给用户时物理删除。检查和删除在同一事务，已分配则 409 并回滚。 */
  async remove(id: number) {
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id },
        select: { id: true, isSystem: true },
      });

      if (!role) {
        throw new NotFoundException('角色不存在');
      }

      if (role.isSystem) {
        throw new ConflictException('系统角色不能删除');
      }

      const assignedCount = await tx.userRole.count({
        where: { roleId: id },
      });

      if (assignedCount > 0) {
        throw new ConflictException('角色已分配给用户，无法删除');
      }

      await tx.role.delete({
        where: { id },
      });
    });
  }
}
