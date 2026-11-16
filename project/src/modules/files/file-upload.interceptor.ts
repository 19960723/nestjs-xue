import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import multer, { MulterError } from 'multer';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { Observable } from 'rxjs';
import type { Environment } from '../../config/env.validation.js';

interface UploadRequest {
  file?: {
    path: string;
    size: number;
    originalname: string;
  };
}

/**
 * 把单个 file 字段写到临时目录。超过体积、多文件或额外字段都在进入业务前拒绝。
 * 临时文件名由服务端生成，不使用客户端文件名。
 */
@Injectable()
export class FileUploadInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const root = this.config.get('UPLOAD_ROOT', { infer: true });
    if (!root) {
      throw new BadRequestException('请求参数不合法');
    }
    const max = this.config.getOrThrow('UPLOAD_MAX_BYTES');
    const upload = multer({
      storage: multer.diskStorage({
        destination: path.join(root, 'tmp'),
        filename: (_req, _file, callback) => {
          callback(null, randomBytes(16).toString('hex'));
        },
      }),
      limits: {
        fileSize: max,
        files: 1,
        fields: 0,
        parts: 1,
      },
    }).single('file');

    const http = context.switchToHttp();
    return new Promise((resolve, reject) => {
      upload(http.getRequest(), http.getResponse(), (error: unknown) => {
        if (error) {
          reject(mapUploadError(error));
          return;
        }
        const request = http.getRequest<UploadRequest>();
        if (!request.file) {
          reject(new BadRequestException('请求参数不合法'));
          return;
        }
        resolve(next.handle());
      });
    });
  }
}

function mapUploadError(error: unknown): Error {
  if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return new PayloadTooLargeException('文件过大');
  }
  return new BadRequestException('请求参数不合法');
}
