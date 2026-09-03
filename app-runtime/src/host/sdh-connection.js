import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const normalizeUrl = (value) => {
  const url = new URL(String(value ?? '').trim().replace(/\/+$/, ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Object.assign(new Error('SDH 服务地址必须是 http(s) URL'), { code: 'HARNESS_CONFIG_INVALID' });
  return url.toString().replace(/\/$/, '');
};

export class SdhConnectionStore {
  constructor(path) { this.path = path; }
  async get() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      return { baseUrl: normalizeUrl(value.baseUrl), configured: true };
    } catch (error) {
      if (error.code === 'ENOENT') return { baseUrl: '', configured: false };
      throw error;
    }
  }
  async set(input) {
    const value = { baseUrl: normalizeUrl(input?.baseUrl) };
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, this.path);
    return { ...value, configured: true };
  }
}

export class RemoteSdhClient {
  constructor({ connection, fetch: fetchImpl = fetch, timeoutMs = 5000 }) { this.connection = connection; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; }
  async request(path, init = {}) {
    const { baseUrl, configured } = await this.connection.get();
    if (!configured) throw Object.assign(new Error('请先配置远程 smalldashharness 服务地址'), { code: 'HARNESS_NOT_CONFIGURED' });
    let response;
    try { response = await this.fetch(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers }, signal: init.signal ?? AbortSignal.timeout(this.timeoutMs) }); }
    catch (error) { throw Object.assign(new Error(`无法连接远程 smalldashharness：${error.message}`), { code: 'HARNESS_UNAVAILABLE', cause: error }); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error?.message ?? payload.error ?? `SDH HTTP ${response.status}`), { code: payload.code ?? 'HARNESS_REQUEST_FAILED', status: response.status });
    return payload;
  }
  health() { return this.request('/health'); }
  models() { return this.request('/api/models'); }
  saveModel(input) { return this.request('/api/models', { method: 'POST', body: JSON.stringify(input) }); }
  probeModel(input) { return this.request('/api/models/probe', { method: 'POST', body: JSON.stringify(input) }); }
  setDefaultModel(id) { return this.request('/api/models/default', { method: 'POST', body: JSON.stringify({ id }) }); }
}
