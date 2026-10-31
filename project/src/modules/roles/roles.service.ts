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

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('角色编码已存在');
    }

    throw error;
  }

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
      // 编码唯一性由数据库兜底，避免先查询再创建时的并发竞争。
      this.handleWriteError(error);
    }
  }

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

  async update(id: number, updateRoleDto: UpdateRoleDto) {
    await this.findOne(id);

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

  async remove(id: number) {
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!role) {
        throw new NotFoundException('角色不存在');
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
