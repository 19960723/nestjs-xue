import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { userPublicSelect } from './user.select.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const targetText = Array.isArray(target)
        ? target.join(' ')
        : String(target ?? '');
      const text = `${targetText} ${error.message}`;

      if (text.includes('username')) {
        throw new ConflictException('用户名已被使用');
      }

      if (text.includes('phone')) {
        throw new ConflictException('手机号已被使用');
      }

      if (text.includes('email')) {
        throw new ConflictException('邮箱已被使用');
      }

      throw new ConflictException('唯一字段冲突');
    }

    throw error;
  }

  private profileData(dto: UpdateUserDto) {
    if (dto.email === null) {
      throw new BadRequestException('邮箱不能为空');
    }

    return {
      email: dto.email,
      username: dto.username,
      nickname: dto.nickname,
      phone: dto.phone,
      sex: dto.sex,
      avatar: dto.avatar,
    };
  }

  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          nickname: dto.nickname,
          phone: dto.phone,
          sex: dto.sex,
          avatar: dto.avatar,
        },
        select: userPublicSelect,
      });
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  async findAll(query: QueryUserDto) {
    const { page, pageSize, keyword } = query;
    const where: Prisma.UserWhereInput = keyword
      ? {
          OR: [
            { username: { contains: keyword } },
            { nickname: { contains: keyword } },
            { email: { contains: keyword } },
          ],
        }
      : {};

    const [list, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userPublicSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      list,
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userPublicSelect,
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);

    try {
      return await this.prisma.user.update({
        where: { id },
        data: this.profileData(dto),
        select: userPublicSelect,
      });
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  async remove(id: number) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      const assignedCount = await tx.userRole.count({
        where: { userId: id },
      });

      if (assignedCount > 0) {
        throw new ConflictException('用户已分配角色，无法删除');
      }

      await tx.user.delete({
        where: { id },
      });
    });
  }
}
