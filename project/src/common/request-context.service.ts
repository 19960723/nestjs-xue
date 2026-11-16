import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** 当前请求的 requestId。日志在依赖注入之外也能读到，没有请求时为空。 */
export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? '';
}

/** 用 AsyncLocalStorage 保存当前请求的 requestId，避免把标识挂到全局变量上。 */
@Injectable()
export class RequestContextService {
  run(requestId: string, callback: () => void): void {
    storage.run({ requestId }, callback);
  }

  getRequestId(): string {
    return currentRequestId();
  }
}
