import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';

/**
 * 认证模块。JwtModule 只提供 HS256 和已校验的 issuer、audience、有效期。
 * 导出 PasswordService 给首次设密使用。
 * JwtAuthGuard 已写好，这里还没有注册为 APP_GUARD，现有路由尚未被它拦截。
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256' as const,
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
          expiresIn: config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [PasswordService, AuthService],
  exports: [PasswordService],
})
export class AuthModule {}
