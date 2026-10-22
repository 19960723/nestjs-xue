import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor(config: ConfigService) {
        const adapter = new PrismaMariaDb({
            host: config.getOrThrow<string>('DATABASE_HOST'),
            port: Number(config.getOrThrow<string>('DATABASE_PORT')),
            user: config.getOrThrow<string>('DATABASE_USERNAME'),
            password: config.getOrThrow<string>('DATABASE_PASSWORD'),
            database: config.getOrThrow<string>('DATABASE_NAME'),
            connectionLimit: 5,
        });
        super({
            adapter,
        });
    }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
