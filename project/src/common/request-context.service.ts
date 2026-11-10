import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  requestId: string;
}

/** 用 AsyncLocalStorage 保存当前请求的 requestId，避免把标识挂到全局变量上。 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestStore>();

  run(requestId: string, callback: () => void): void {
    this.storage.run({ requestId }, callback);
  }

  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? '';
  }
}
