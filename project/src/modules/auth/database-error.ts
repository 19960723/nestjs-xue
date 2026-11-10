import { Prisma } from '../../generated/prisma/client.js';

/** 识别 Prisma 客户端异常，供 Guard 把数据库故障映射为 503，而不是放行或当成 401。 */
export function isDatabaseError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  );
}
