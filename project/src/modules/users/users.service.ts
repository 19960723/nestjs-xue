import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { userPublicSelect } from './user.select.js';

/**
 * 用户资料。创建和更新不接收密码、状态或角色。
 * 查询一律用公开字段，响应里没有密码和删除时间。
 * 首次设密只在密码仍为空、未删除且启用时写入；哈希在更新前计算。
 * 删除仍是硬删除，已分配角色时整段事务失败。
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** 把唯一索引冲突换成字段文案。认不出字段时仍返回 409，不把 Prisma 内部信息交给客户端。 */
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

  /** 只挑资料字段。显式传入的邮箱 null 在这里拒绝，不能把必填邮箱清空。 */
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

  /** 创建资料，不写密码。新用户在首次设密前不能登录。 */
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

  /** 分页列表。列表和总数放在同一事务里，关键字只匹配用户名、昵称和邮箱。 */
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

  /** 按主键返回公开资料。当前不按 deletedAt 过滤，响应里也不含删除时间。 */
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

  /**
   * 条件更新写入第一份密码。条件里同时要求密码为空、未删除且启用，避免先查再改的空窗。
   * 没写上时再读状态，区分不存在、已禁用和已设密；读和重试之间仍可能被别人设密。
   */
  async setInitialPassword(id: number, password: string) {
    const passwordHash = await this.passwords.hash(password);
    const updated = await this.prisma.user.updateMany({
      where: {
        id,
        password: null,
        deletedAt: null,
        status: 1,
      },
      data: { password: passwordHash },
    });

    if (updated.count === 1) {
      return this.findOne(id);
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        deletedAt: true,
        status: true,
        password: true,
      },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    if (existing.status !== 1) {
      throw new ConflictException('用户已禁用');
    }

    if (existing.password !== null) {
      throw new ConflictException('密码已设置');
    }

    const retried = await this.prisma.user.updateMany({
      where: {
        id,
        password: null,
        deletedAt: null,
        status: 1,
      },
      data: { password: passwordHash },
    });

    if (retried.count === 1) {
      return this.findOne(id);
    }

    throw new ConflictException('密码已设置');
  }

  /** 只改资料。不在这里改密码、状态或角色。 */
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

  /** 未分配角色时物理删除。检查和删除放在同一事务，已分配则 409 并回滚。 */
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
