import { open } from 'node:fs/promises';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface DetectedImage {
  ext: 'png' | 'jpg';
  mime: 'image/png' | 'image/jpeg';
}

/**
 * 只认 PNG 和 JPEG 的文件头。不看客户端声明的类型，也不把扩展名当依据。
 * 读失败或头部不匹配时返回 null。这里没有重新解码图片，不能称为完整的图像安全处理。
 */
export async function detectImage(
  filePath: string,
): Promise<DetectedImage | null> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, 8, 0);
    const head = buffer.subarray(0, bytesRead);
    if (head.length >= PNG.length && head.subarray(0, PNG.length).equals(PNG)) {
      return { ext: 'png', mime: 'image/png' };
    }
    if (
      head.length >= 3 &&
      head[0] === 0xff &&
      head[1] === 0xd8 &&
      head[2] === 0xff
    ) {
      return { ext: 'jpg', mime: 'image/jpeg' };
    }
    return null;
  } finally {
    await handle.close();
  }
}
