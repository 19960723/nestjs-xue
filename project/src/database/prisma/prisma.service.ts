import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(PrismaService.name)

    constructor(config: ConfigService) {
        const adapter = new PrismaMariaDb({
            host: config.getOrThrow<string>('DATABASE_HOST'),
            port: Number(config.getOrThrow<string>('DATABASE_PORT')),
            user: config.getOrThrow<string>('DATABASE_USERNAME'),
            password: config.getOrThrow<string>('DATABASE_PASSWORD'),
            database: config.getOrThrow<string>('DATABASE_NAME'),
            connectionLimit: 5,
            
            // 允许从 MySQL 服务端获取 RSA 公钥
            allowPublicKeyRetrieval: true
        });
        super({
            adapter,
        });
    }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma 数据库连接成功');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma 数据库连接已断开');
  }
}
