import { Injectable } from '@nestjs/common';

// 当前仅提供模板问候内容，用于演示 Controller 到 Provider 的依赖注入。
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
