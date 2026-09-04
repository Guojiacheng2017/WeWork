import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { executePiRun } from '../src/pi-runtime.js';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = await mkdtemp(join(tmpdir(), 'wework-pi-smoke-'));
const executablePath = process.env.PI_EXECUTABLE;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error('Pi smoke test timed out')), 120000);
let toolCalls = 0;

try {
  const id = `smoke-${randomUUID()}`;
  const result = await executePiRun({
    id,
    employeeId: 'smoke-employee',
    runtimeProfile: { id: 'pi-local', adapter: 'pi', model: { provider: 'pi', modelId: 'default' }, systemPrompt: 'This is an isolated adapter smoke test. Follow the requested tool call exactly.', thinkingLevel: 'off' },
    employee: { displayName: 'Pi Smoke Employee', roleName: 'Adapter verifier', skills: [] },
    work: { id: 'smoke-work', title: 'Verify the WeWork Pi bridge', goal: 'Call wework_get_team exactly once, then state the returned team name.' },
    workspace: { kind: 'local', rootPath: workspace },
    session: { id, messages: [] },
  }, {
    ...(executablePath ? { executablePath } : {}),
    extensionPath: resolve(here, '../src/pi-wework-extension.mjs'),
    signal: controller.signal,
    tools: [{
      name: 'wework_get_team', label: 'Read team', description: 'Read the current smoke-test team.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      async execute() { toolCalls += 1; return { content: [{ type: 'text', text: JSON.stringify({ id: 'smoke-team', name: 'Pi Bridge Smoke Team' }) }] }; },
    }],
  });
  if (toolCalls !== 1) throw new Error(`Expected one WeWork tool call, received ${toolCalls}`);
  console.log(JSON.stringify({ ok: true, harness: 'pi', toolCalls, finalText: result.finalText, usage: result.usage }, null, 2));
} finally {
  clearTimeout(timeout);
  await rm(workspace, { recursive: true, force: true });
}
