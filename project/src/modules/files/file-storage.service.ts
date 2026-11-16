import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ReadStream } from 'node:fs';
import type { Environment } from '../../config/env.validation.js';

const KEY_PATTERN = /^[a-f0-9]{64}\.(png|jpg)$/;

/**
 * 管理上传根目录里的临时文件和最终文件。
 * 最终文件名只接受服务端生成的键，调用方不能传入原始路径。
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.directory('tmp'), { recursive: true, mode: 0o700 });
    await mkdir(this.directory('data'), { recursive: true, mode: 0o700 });
  }

  /** 把服务端生成的键解析到 data 目录。键不合法或越出根目录时拒绝。 */
  finalPath(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new NotFoundException('资源不存在');
    }
    return this.contained('data', key);
  }

  openRead(key: string): ReadStream {
    return createReadStream(this.finalPath(key));
  }

  /** 补偿删除。只删除上传根目录里的文件；已经不在时忽略。 */
  async removeQuiet(filePath: string): Promise<void> {
    const root = this.root();
    const target = path.resolve(filePath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      return;
    }
    await rm(target, { force: true }).catch(() => undefined);
  }

  private directory(name: 'tmp' | 'data'): string {
    return this.contained(name);
  }

  private contained(name: 'tmp' | 'data', fileName?: string): string {
    const root = this.root();
    const directory = path.resolve(root, name);
    const target =
      fileName === undefined ? directory : path.resolve(directory, fileName);
    if (target !== directory && !target.startsWith(`${directory}${path.sep}`)) {
      throw new NotFoundException('资源不存在');
    }
    return target;
  }

  private root(): string {
    const root = this.config.get('UPLOAD_ROOT', { infer: true });
    if (!root) {
      throw new Error('UPLOAD_ROOT 未配置');
    }
    return root;
  }
}
