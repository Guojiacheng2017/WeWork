import { readPiJsonLines } from '../pi-json-lines.js';
import { spawn } from 'node:child_process';
import { scrubHostChildEnvironment } from './process.js';

const rpcArgs = ['--mode', 'rpc', '--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-approve'];

export function discoverPiModels(executablePath, { spawnProcess = spawn, timeoutMs = 10000, environment = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executablePath, rpcArgs, { shell: false, windowsHide: true, env: scrubHostChildEnvironment(environment), stdio: ['pipe', 'pipe', 'pipe'] });
    const pending = new Map(); let closeLines; let stderr = ''; let closed = false;
    const finish = (error, value) => { if (closed) return; closed = true; closeLines?.(); clearTimeout(timer); if (child.exitCode === null && !child.killed) child.kill('SIGTERM'); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(Object.assign(new Error('Pi model discovery timed out'), { code: 'PI_MODEL_DISCOVERY_TIMEOUT' })), timeoutMs);
    const request = (id, type) => { pending.set(id, undefined); child.stdin.write(`${JSON.stringify({ id, type })}\n`); };
    const complete = () => {
      if ([...pending.values()].some((value) => value === undefined)) return;
      const state = pending.get('state') ?? {}; const available = pending.get('models') ?? {};
      const rawModels = Array.isArray(available) ? available : available.models ?? [];
      const current = state.model ?? state.currentModel;
      const currentProvider = current?.provider ?? state.provider;
      const currentId = current?.id ?? current?.modelId ?? state.modelId;
      const now = new Date().toISOString();
      const models = rawModels.map((model) => {
        const provider = String(model.provider ?? model.providerId ?? 'pi');
        const modelId = String(model.id ?? model.modelId ?? '');
        return { id: `pi:${encodeURIComponent(provider)}:${encodeURIComponent(modelId)}`, harness: 'pi', name: String(model.name ?? model.displayName ?? modelId), provider, modelId, verified: true, isDefault: provider === currentProvider && modelId === currentId, source: 'harness-discovered', createdAt: now, updatedAt: now };
      }).filter((model) => model.modelId);
      const defaultModel = models.find((model) => model.isDefault);
      finish(null, { models, defaults: defaultModel ? { pi: defaultModel.id } : {} });
    };
    closeLines = readPiJsonLines(child.stdout, event => { if (event.type === 'response' && pending.has(event.id)) { if (!event.success) return finish(Object.assign(new Error(event.error ?? 'Pi RPC failed'), { code: 'PI_MODEL_DISCOVERY_FAILED' })); pending.set(event.id, event.data); complete(); } }, error => finish(Object.assign(error, {code:'PI_MODEL_DISCOVERY_FAILED'})));
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.once('error', finish); child.once('close', (code) => { if (!closed) finish(Object.assign(new Error(stderr.trim() || `Pi exited during model discovery (${code})`), { code: 'PI_MODEL_DISCOVERY_FAILED' })); });
    request('state', 'get_state'); request('models', 'get_available_models');
  });
}
