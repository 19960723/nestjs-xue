import { Injectable } from '@nestjs/common';

interface UserInfo {
  id: number;
  name: string;
  email: string;
}


@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
  
  getUserInfo(): UserInfo {
    return {id: 1, name: 'John Doe', email: 'john.doe@example.com'};
  }
}

