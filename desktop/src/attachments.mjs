import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function importAttachment(root, input) {
  let name, bytes;
  if (typeof input.path === 'string') {
    if (!isAbsolute(input.path)) throw new Error('需要绝对文件路径');
    const info = await stat(input.path);
    if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('请选择不超过 20 MB 的文件');
    name = basename(input.path); bytes = await readFile(input.path);
  } else {
    if (typeof input.name !== 'string' || typeof input.base64 !== 'string' || input.base64.length > 28 * 1024 * 1024) throw new Error('无效附件');
    name = basename(input.name); bytes = Buffer.from(input.base64, 'base64');
  }
  if (bytes.length > 20 * 1024 * 1024) throw new Error('附件不能超过 20 MB');
  const id = randomUUID(), folder = join(root, 'attachments', id);
  await mkdir(folder, { recursive: true });
  const path = join(folder, name); await writeFile(path, bytes);
  const mime = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'})[extname(name).toLowerCase()];
  return { id, name, path, size: bytes.length, preview: mime ? `data:${mime};base64,${bytes.toString('base64')}` : undefined };
}
