import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import readline from 'node:readline';
import test from 'node:test';

test('Plane plugin speaks the WeWork MCP protocol and declares permissions', async () => {
  const root = resolve(import.meta.dirname, '../../plugins/wework-plane');
  const child = spawn(process.execPath, ['./server.mjs'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = readline.createInterface({ input: child.stdout });
  const responses = new Map();
  lines.on('line', line => { const message = JSON.parse(line); responses.get(message.id)?.(message); });
  const request = (id, method, params = {}) => new Promise((resolveResponse, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 2000);
    responses.set(id, message => { clearTimeout(timer); resolveResponse(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    const initialized = await request(1, 'initialize');
    assert.equal(initialized.result.serverInfo.name, 'wework-plane');
    const listed = await request(2, 'tools/list');
    assert.deepEqual(listed.result.tools.map(tool => tool.name), ['project_test', 'project_sync', 'project_create_work_item', 'project_update_work_item']);
    assert.deepEqual(listed.result.tools[1]._meta['wework/permissions'], ['network', 'credentials:integration', 'project:read']);
    assert.deepEqual(listed.result.tools[2]._meta['wework/permissions'], ['network', 'credentials:integration', 'project:write']);
  } finally {
    child.kill('SIGTERM');
  }
});
