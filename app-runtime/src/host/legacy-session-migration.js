import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const validSessionId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const maxLegacySessionBytes = 16 * 1024 * 1024;
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const validToolCall = (call) => plain(call) && typeof call.id === 'string' && call.id && plain(call.function) && typeof call.function.name === 'string' && typeof call.function.arguments === 'string';
const validMessage = (message) => {
  if (!plain(message) || !['system', 'user', 'assistant', 'tool'].includes(message.role)) return false;
  if (message.role === 'assistant') {
    if (message.content !== undefined && message.content !== null && typeof message.content !== 'string') return false;
  } else if (typeof message.content !== 'string') return false;
  return message.tool_calls === undefined || Array.isArray(message.tool_calls) && message.tool_calls.every(validToolCall);
};

async function quarantine(sourcePath, sessionId, quarantineRoot, reason, copySource) {
  if (!quarantineRoot) return;
  await mkdir(quarantineRoot, { recursive: true, mode: 0o700 });
  const stem = `smalldash-session-${sessionId}.${randomUUID()}`;
  if (copySource) await copyFile(sourcePath, join(quarantineRoot, `${stem}.json`), constants.COPYFILE_EXCL);
  await writeFile(join(quarantineRoot, `${stem}.reason.txt`), `${reason}\n`, { flag: 'wx', mode: 0o600 });
}

export async function migrateLegacySmalldashSession({ sessionId, legacyDataRoots = [], targetDataRoot, quarantineRoot }) {
  if (!validSessionId(sessionId) || !targetDataRoot) return false;
  const targetDirectory = join(targetDataRoot, 'smalldash', 'sessions');
  const targetPath = join(targetDirectory, `${sessionId}.json`);
  try { await lstat(targetPath); return false; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const legacyRoot of legacyDataRoots) {
    const sourcePath = join(legacyRoot, 'smalldash', 'sessions', `${sessionId}.json`);
    let info;
    try { info = await lstat(sourcePath); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue; throw error; }
    if (!info.isFile()) {
      await quarantine(sourcePath, sessionId, quarantineRoot, 'legacy Session is not a regular file', false);
      return false;
    }
    if (info.size > maxLegacySessionBytes) {
      await quarantine(sourcePath, sessionId, quarantineRoot, 'legacy Session exceeds the migration size limit', false);
      return false;
    }
    try {
      const text = await readFile(sourcePath, 'utf8');
      const value = JSON.parse(text);
      if (!plain(value) || value.id !== sessionId || !Array.isArray(value.messages) || !value.messages.every(validMessage)) throw new Error('legacy Session has invalid structure');
    } catch (error) {
      await quarantine(sourcePath, sessionId, quarantineRoot, error instanceof Error ? error.message : String(error), true);
      return false;
    }
    await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
    try { await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL); return true; }
    catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  }
  return false;
}
