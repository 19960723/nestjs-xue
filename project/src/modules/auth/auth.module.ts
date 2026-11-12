import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LoginLimitService } from './login-limit.service.js';
import { PasswordService } from './password.service.js';

/**
 * 认证模块。JwtModule 只提供 HS256 和已校验的 issuer、audience、有效期。
 * JwtAuthGuard 由授权模块包进唯一的全局 Guard，这里只导出它。
 * 导出 PasswordService 给首次设密使用。
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
  providers: [PasswordService, LoginLimitService, AuthService, JwtAuthGuard],
  exports: [PasswordService, JwtAuthGuard],
})
export class AuthModule {}
