import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

interface UserInfo {
  id: number;
  name: string;
  email: string;
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('/userinfo')
  getUserInfo(): UserInfo {
    return this.appService.getUserInfo();
  }
}
