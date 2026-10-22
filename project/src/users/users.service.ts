import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // 处理唯一字段冲突
  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('邮箱已被使用');
    }

    throw error;
  }

  // 新增用户
  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: dto,
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  // 分页查询
  async findAll(query: QueryUserDto) {
    const { page, pageSize, keyword } = query;
    
    const where: Prisma.UserWhereInput = keyword
      ? {
          OR: [
            { name: { contains: keyword } },
            { email: { contains: keyword } },
          ],
        }
      : {};

    const [list, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
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

  // 查询详情
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  // 修改用户
  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);

    try {
      return await this.prisma.user.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  // 删除用户
  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: '删除成功' };
  }
}