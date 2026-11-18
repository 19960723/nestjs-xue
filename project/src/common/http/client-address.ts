/**
 * 只保留直接连接地址。去掉 IPv4 映射前缀，过长或空白归入同一个未知桶。
 * 不读取 X-Forwarded-For，避免调用方自己换地址来拆开限额。
 */
export function normalizeClientAddress(ip: string): string {
  const trimmed = ip.trim();
  const mapped = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  if (mapped.length === 0 || mapped.length > 45) {
    return 'unknown';
  }
  return mapped;
}
