import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importAttachment } from './attachments.mjs';
test('imports clipboard bytes and copied paths into durable attachments', async () => {
 const root = await mkdtemp(join(tmpdir(), 'wework-attachments-'));
 try {
  const image = await importAttachment(root, { name: 'screen.png', base64: Buffer.from('image-bytes').toString('base64') });
  assert.equal(await readFile(image.path, 'utf8'), 'image-bytes');
  assert.ok(image.preview.startsWith('data:image/png;base64,'));
  const source = join(root, 'notes.txt'); await writeFile(source, 'notes');
  const document = await importAttachment(root, { path: source });
  assert.notEqual(document.path, source); assert.equal(await readFile(document.path, 'utf8'), 'notes');
  await assert.rejects(importAttachment(root, { path: root }), /20 MB/);
  await assert.rejects(importAttachment(root, { path: 'relative.txt' }), /绝对/);
 } finally { await rm(root, { recursive: true, force: true }); }
});
