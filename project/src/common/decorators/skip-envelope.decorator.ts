import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** 跳过统一成功包装，仅用于文件流、重定向或原始工具路由。 */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
