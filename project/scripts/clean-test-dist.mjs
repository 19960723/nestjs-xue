import { rmSync } from 'node:fs';

// 仅清理相对于本脚本的固定产物目录，防止删除的 TS 测试留下旧 JS 继续执行。
// 不接收外部路径参数，避免工作目录变化或参数错误扩大清理范围。
rmSync(new URL('../.test-dist/', import.meta.url), {
  recursive: true,
  force: true,
});
