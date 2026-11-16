import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service.js';
import { FileUploadInterceptor } from './file-upload.interceptor.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

/**
 * 文件模块。只有上传开关打开时才由应用装配。
 * 关闭时没有上传或下载路由。
 */
@Module({
  controllers: [FilesController],
  providers: [FileStorageService, FileUploadInterceptor, FilesService],
})
export class FilesModule {}
