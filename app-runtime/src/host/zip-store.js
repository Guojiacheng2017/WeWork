import { readFile, writeFile } from 'node:fs/promises';

const table = Array.from({ length: 256 }, (_, value) => {
  let result = value;
  for (let bit = 0; bit < 8; bit += 1) result = (result & 1) ? (0xedb88320 ^ (result >>> 1)) : (result >>> 1);
  return result >>> 0;
});

const crc32 = (value) => {
  let crc = 0xffffffff;
  for (const byte of value) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const safeName = (name) => {
  const normalized = String(name).replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('ZIP 包含不安全路径');
  return normalized;
};

export async function writeZip(path, entries) {
  const local = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(safeName(entry.name));
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0, 10); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  await writeFile(path, Buffer.concat([...local, ...central, end]), { mode: 0o600 });
}

export async function readZip(path, limits = {}) {
  const archive = await readFile(path);
  const maxBytes = limits.maxBytes ?? 2 * 1024 * 1024 * 1024;
  const maxEntries = limits.maxEntries ?? 100000;
  if (archive.length > maxBytes) throw new Error('ZIP 文件过大');
  let end = -1;
  for (let index = archive.length - 22; index >= Math.max(0, archive.length - 65557); index -= 1) if (archive.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  if (end < 0) throw new Error('不是有效的 ZIP 文件');
  const count = archive.readUInt16LE(end + 10);
  if (count > maxEntries) throw new Error('ZIP 文件条目过多');
  let cursor = archive.readUInt32LE(end + 16);
  const entries = new Map();
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP 中央目录损坏');
    const method = archive.readUInt16LE(cursor + 10);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28); const extraLength = archive.readUInt16LE(cursor + 30); const commentLength = archive.readUInt16LE(cursor + 32);
    const name = safeName(archive.subarray(cursor + 46, cursor + 46 + nameLength).toString());
    const localOffset = archive.readUInt32LE(cursor + 42);
    if (method !== 0 || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('ZIP 使用了不支持的压缩格式');
    const localNameLength = archive.readUInt16LE(localOffset + 26); const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    total += size;
    if (total > maxBytes || start + size > archive.length) throw new Error('ZIP 内容大小无效');
    entries.set(name, Buffer.from(archive.subarray(start, start + size)));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
