import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/**
 * 刷新入参。只接受登录或上次刷新交付的 32 字节 base64url 原文。
 * 不 trim，摘要和过期判断放在服务里，避免把格式错误和凭据无效混成同一种响应。
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: '一次性 Refresh 原文。43 位 base64url，不含填充',
    minLength: 43,
    maxLength: 43,
    example: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
  })
  @IsString({ message: '刷新凭据必须是字符串' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: '刷新凭据格式不正确' })
  refreshToken!: string;
}
