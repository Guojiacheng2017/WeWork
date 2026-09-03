import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const EMPTY = { schemaVersion: 2, models: [], defaults: {} };
const WEWORK_MANAGED_HARNESS = 'smalldashharness';
const MODEL_KEYS = new Set(['id', 'harness', 'name', 'provider', 'modelId', 'api', 'baseUrl', 'verified', 'createdAt', 'updatedAt']);

const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const text = (value, field, max = 300) => {
  if (typeof value !== 'string') fail('MODEL_INVALID', `${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\x00-\x1f\x7f]/.test(normalized)) fail('MODEL_INVALID', `${field} is invalid`);
  return normalized;
};
export const normalizeHarnessModelInput = (input, { persisted = false, verifiedByHost = false, trustedVerification = false } = {}) => {
  if (!plain(input) || Object.keys(input).some((key) => !MODEL_KEYS.has(key))) fail('MODEL_INVALID', 'unknown model fields are not allowed');
  if (input.harness !== WEWORK_MANAGED_HARNESS) fail('MODEL_CONNECTION_HARNESS_MANAGED', 'This Harness manages its own login, model catalog and default model');
  const model = { harness: WEWORK_MANAGED_HARNESS, name: text(input.name, 'name', 200), provider: text(input.provider, 'provider', 100), modelId: text(input.modelId, 'modelId'), verified: persisted ? trustedVerification && input.verified === true : verifiedByHost === true };
  if (input.api !== undefined) {
    if (!['openai-completions', 'openai-responses'].includes(input.api)) fail('MODEL_INVALID', 'api is invalid');
    model.api = input.api;
  }
  if (input.baseUrl !== undefined) {
    const baseUrl = text(input.baseUrl, 'baseUrl', 4096);
    try { const url = new URL(baseUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid'); }
    catch { fail('MODEL_INVALID', 'baseUrl is invalid'); }
    model.baseUrl = baseUrl;
  }
  if (persisted) {
    model.id = text(input.id, 'id', 200);
    model.createdAt = text(input.createdAt, 'createdAt', 100);
    model.updatedAt = text(input.updatedAt, 'updatedAt', 100);
  } else if (input.id !== undefined) model.id = text(input.id, 'id', 200);
  return model;
};

export class HarnessModelCatalog {
  constructor(path) { this.path = path; this.queue = Promise.resolve(); }
  #exclusive(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
  async #read() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      const trustedVerification = value?.schemaVersion === 2;
      const rawModels = Array.isArray(value?.models) ? value.models : [];
      const models = rawModels.flatMap((model) => {
        if (!plain(model) || model.harness !== WEWORK_MANAGED_HARNESS) return [];
        try { return [normalizeHarnessModelInput(model, { persisted: true, trustedVerification })]; } catch { return []; }
      });
      const defaults = plain(value?.defaults) && typeof value.defaults.smalldashharness === 'string' && models.some((model) => model.id === value.defaults.smalldashharness)
        ? { smalldashharness: value.defaults.smalldashharness } : {};
      const sanitized = { schemaVersion: 2, models, defaults: trustedVerification ? defaults : {} };
      if (JSON.stringify(value) !== JSON.stringify(sanitized)) {
        const quarantine = `${this.path}.quarantine.${Date.now()}.${randomUUID()}.json`;
        await rename(this.path, quarantine);
        await this.#write(sanitized);
      }
      return sanitized;
    } catch (error) { if (error.code === 'ENOENT') return structuredClone(EMPTY); throw error; }
  }
  async #write(value) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, this.path);
  }
  read() { return this.#exclusive(() => this.#read()); }
  write(value) { return this.#exclusive(() => this.#write(value)); }
  async list() {
    const value = await this.read();
    const models = value.models.filter((model) => model.harness === WEWORK_MANAGED_HARNESS);
    return { models: models.map((model) => ({ ...model, source: 'wework-managed', isDefault: value.defaults[model.harness] === model.id })), defaults: value.defaults.smalldashharness ? { smalldashharness: value.defaults.smalldashharness } : {} };
  }
  async save(input, { verifiedByHost = false } = {}) {
    const requested = normalizeHarnessModelInput(input, { verifiedByHost });
    return this.#exclusive(async () => {
      const value = await this.#read();
      const now = new Date().toISOString();
      const prior = requested.id ? value.models.find((model) => model.id === requested.id) : undefined;
      const model = { ...requested, id: prior?.id ?? randomUUID(), updatedAt: now, createdAt: prior?.createdAt ?? now };
      value.models = prior ? value.models.map((item) => item.id === model.id ? model : item) : [...value.models, model];
      if (!value.defaults[model.harness] && model.verified) value.defaults[model.harness] = model.id;
      await this.#write(value);
      return { ...model, isDefault: value.defaults[model.harness] === model.id };
    });
  }
  async setDefault(harness, modelId) {
    if (harness !== WEWORK_MANAGED_HARNESS) fail('MODEL_CONNECTION_HARNESS_MANAGED', 'This Harness manages its own default model');
    await this.#exclusive(async () => {
      const value = await this.#read();
      const model = value.models.find((item) => item.id === modelId);
      if (!model || model.harness !== harness) fail('MODEL_HARNESS_MISMATCH', 'model does not belong to this Harness');
      value.defaults[harness] = modelId;
      await this.#write(value);
    });
    return this.list();
  }
}
