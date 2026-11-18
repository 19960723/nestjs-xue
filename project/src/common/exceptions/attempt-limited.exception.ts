import { HttpException, HttpStatus } from '@nestjs/common';

/** 固定窗口超过上限。retryAfterSeconds 写入 Retry-After，响应正文不包含账号或来源。 */
export class AttemptLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('尝试过于频繁', HttpStatus.TOO_MANY_REQUESTS);
  }
}
