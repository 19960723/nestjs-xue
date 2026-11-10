import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/** Argon2id 起点参数。登录 dummy 哈希必须用同一组参数生成。 */
const ARGON2ID_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * 密码哈希边界。只暴露 hash 和 verify，不记录原文，也不把哈希交回 Controller。
 * memoryCost 19456 KiB、timeCost 2、parallelism 1。调用方在事务外计算哈希。
 */
@Injectable()
export class PasswordService {
  /** 生成带随机盐的 Argon2id 哈希。调用方负责在事务外计算。 */
  hash(password: string): Promise<string> {
    return hash(password, ARGON2ID_OPTIONS);
  }

  /** 比较明文和已有哈希。不改写密码，也不把原文写入日志。 */
  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
