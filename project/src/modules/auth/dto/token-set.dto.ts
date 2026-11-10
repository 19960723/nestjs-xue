import { ApiProperty } from '@nestjs/swagger';

export class TokenSetDto {
  @ApiProperty({ description: '短期 Access JWT' })
  accessToken!: string;

  @ApiProperty({ description: '一次性 Refresh。服务端只保存摘要' })
  refreshToken!: string;

  @ApiProperty({ description: '令牌类型', example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({
    description: 'Access 有效秒数',
    type: 'integer',
    example: 900,
  })
  expiresIn!: number;
}
