import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { PasswordService } from './password.service.js';

const LOGIN_FAILED = '用户名或密码错误';

// 与 PasswordService 同参数的 Argon2id。只用于不存在或未设密的请求，结果不作为登录依据。
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$gFuzNlAWP63U0zANLf9Yng$1eAnFVlUv2tISM38c5SVQUqjPHaTYxAsn92vVXUIfj4';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

interface AccessPayload {
  sub: string;
  sid: string;
  jti: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(username: string, password: string): Promise<TokenSet> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, password: true, status: true, deletedAt: true },
    });
    const passwordHash = user?.password ?? null;
    const passwordMatches =
      passwordHash === null
        ? await this.passwords.verify(DUMMY_PASSWORD_HASH, password)
        : await this.passwords.verify(passwordHash, password);
    const canLogin =
      user !== null &&
      passwordHash !== null &&
      user.deletedAt === null &&
      user.status === 1 &&
      passwordMatches;

    if (!canLogin || !user || passwordHash === null) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const refreshTtl = this.config.getOrThrow<number>('REFRESH_TTL_SECONDS');
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);
    const session = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: {
          id: user.id,
          deletedAt: null,
          status: 1,
          password: passwordHash,
        },
        select: { id: true },
      });
      if (!current) {
        return null;
      }

      return tx.userSession.create({
        data: {
          userId: current.id,
          refreshTokenHash,
          expiresAt,
        },
        select: { id: true },
      });
    });

    if (!session) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const accessTtl = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const payload: AccessPayload = {
      sub: String(user.id),
      sid: String(session.id),
      jti: randomUUID(),
    };
    let accessToken: string;
    try {
      accessToken = await this.jwt.signAsync(payload, {
        algorithm: 'HS256',
        expiresIn: accessTtl,
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
    } catch {
      await this.revokeUndeliveredSession(session.id);
      this.logger.error('Access token 签发失败');
      throw new InternalServerErrorException('服务暂不可用');
    }

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
    };
  }

  private async revokeUndeliveredSession(sessionId: number): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
}
