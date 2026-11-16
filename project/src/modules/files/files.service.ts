import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { rename } from 'node:fs/promises';
import type { ReadStream } from 'node:fs';
import { Prisma } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.validation.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { detectImage } from './file-signature.js';
import { FileStorageService } from './file-storage.service.js';

export interface UploadedTempFile {
  path: string;
  size: number;
  originalname: string;
}

export interface StoredFileMetadata {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface OpenedFile {
  mimeType: 'image/png' | 'image/jpeg';
  filename: 'file.png' | 'file.jpg';
  stream: ReadStream;
}

/**
 * 保存和读取上传文件。响应不返回磁盘路径或存储键。
 * 数据库写入失败时删除已经移入的文件。别人的文件按不存在返回，避免泄露是否存在。
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async save(
    ownerId: number,
    file: UploadedTempFile | undefined,
  ): Promise<StoredFileMetadata> {
    if (!file || file.size < 1) {
      if (file) await this.storage.removeQuiet(file.path);
      throw new BadRequestException('请求参数不合法');
    }

    const max = this.config.getOrThrow('UPLOAD_MAX_BYTES');
    let finalPath: string | undefined;
    try {
      if (file.size > max) {
        throw new PayloadTooLargeException('文件过大');
      }
      const detected = await detectImage(file.path);
      if (!detected) {
        throw new BadRequestException('文件格式不支持');
      }
      const key = `${randomBytes(32).toString('hex')}.${detected.ext}`;
      finalPath = this.storage.finalPath(key);
      await rename(file.path, finalPath);
      const row = await this.prisma.storedFile.create({
        data: {
          ownerId,
          storageKey: key,
          originalName: sanitizeOriginalName(file.originalname),
          mimeType: detected.mime,
          sizeBytes: file.size,
        },
        select: {
          id: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      });
      finalPath = undefined;
      return row;
    } catch (error: unknown) {
      await this.storage.removeQuiet(file.path);
      if (finalPath) await this.storage.removeQuiet(finalPath);
      if (
        error instanceof BadRequestException ||
        error instanceof PayloadTooLargeException
      ) {
        throw error;
      }
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }

  /**
   * 所有者可以下载自己的文件。持有 files:read 的用户可以下载别人的文件。
   * 其余情况统一返回不存在，不说明文件是否存在。
   */
  async open(userId: number, id: string): Promise<OpenedFile> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new NotFoundException('资源不存在');
    }

    let row: {
      ownerId: number;
      storageKey: string;
      mimeType: string;
    } | null;
    try {
      row = await this.prisma.storedFile.findFirst({
        where: { id, deletedAt: null },
        select: { ownerId: true, storageKey: true, mimeType: true },
      });
    } catch (error: unknown) {
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
    if (!row || (row.mimeType !== 'image/png' && row.mimeType !== 'image/jpeg')) {
      throw new NotFoundException('资源不存在');
    }
    if (row.ownerId !== userId && !(await this.canReadAny(userId))) {
      throw new NotFoundException('资源不存在');
    }

    return {
      mimeType: row.mimeType,
      filename: row.mimeType === 'image/png' ? 'file.png' : 'file.jpg',
      stream: this.storage.openRead(row.storageKey),
    };
  }

  private async canReadAny(userId: number): Promise<boolean> {
    try {
      const count = await this.prisma.permission.count({
        where: {
          code: 'files:read',
          status: 1,
          roles: {
            some: {
              role: {
                status: 1,
                users: {
                  some: {
                    userId,
                    user: { deletedAt: null, status: 1 },
                  },
                },
              },
            },
          },
        },
      });
      return count > 0;
    } catch (error: unknown) {
      if (isDatabaseError(error)) {
        throw new ServiceUnavailableException('服务暂不可用');
      }
      throw error;
    }
  }
}

/** 原始文件名只作元数据。去掉路径和控制字符，不参与磁盘路径。 */
function sanitizeOriginalName(name: string): string {
  const base = path.basename(name);
  let cleaned = '';
  for (const char of base) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 31 && code !== 127) {
      cleaned += char;
    }
  }
  const trimmed = cleaned.slice(0, 255);
  return trimmed.length > 0 ? trimmed : 'file';
}

function isDatabaseError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  );
}
