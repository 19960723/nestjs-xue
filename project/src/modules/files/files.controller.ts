import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { StreamableFile } from '@nestjs/common';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { Authenticated } from '../../common/decorators/authenticated.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { FileUploadInterceptor } from './file-upload.interceptor.js';
import { FilesService, type UploadedTempFile } from './files.service.js';

/** 文件上传和下载。模块只在 UPLOAD_ENABLED=true 时注册。 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /**
   * 接收单个名为 file 的文件。成功时只返回编号、类型、大小和创建时间。
   * 格式不符返回 400，超过体积返回 413。
   */
  @Post()
  @RequirePermissions('files:upload')
  @UseInterceptors(FileUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传 PNG 或 JPEG' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ description: '已保存文件元数据' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedTempFile,
  ) {
    return this.files.save(user.id, file);
  }

  /**
   * 下载文件内容。所有者或持有 files:read 的用户可以读取。
   * 响应是原始字节，不包进统一信封，也不返回磁盘路径。
   */
  @Get(':id/content')
  @Authenticated()
  @SkipEnvelope()
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: '下载文件内容' })
  @ApiProduces('image/png', 'image/jpeg')
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const opened = await this.files.open(user.id, id);
    return new StreamableFile(opened.stream, {
      type: opened.mimeType,
      disposition: `attachment; filename="${opened.filename}"`,
    });
  }
}
