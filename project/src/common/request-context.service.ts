import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  requestId: string;
}

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
