import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { isAllowedModelApiKeyEnvironment } from './model-credential-policy.js';

const maxBytes = 65536;
const maxDepth = 32;
const maxValues = 4096;
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const credentialReference = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,7}$/;
const environmentName = /^[A-Z_][A-Z0-9_]{0,127}$/;

export const WEWORK_BUILT_IN_CONFIG = Object.freeze({});

const plain = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const invalid = (scope, reason) => new Error(`invalid ${scope} WeWork config: ${reason}`);
const field = (kind) => ({ kind });
const object = (fields, additional) => ({ kind: 'object', fields, additional });
const array = (item) => ({ kind: 'array', item });
const json = field('json');
const jsonObject = object({}, json);
const jsonArray = array(json);
const credentialRef = field('credentialRef');
const apiKeyEnv = field('apiKeyEnv');
const closedNamespace = field('closedNamespace');
const stringList = array(field('string'));

const keyParts = (key) => {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return { normalized, words };
};

const safeKeyMetadata = new Set(['cachekey', 'primarykey']);
const secretSuffixes = new Set(['ref', 'reference', 'env', 'value', 'data', 'material', 'content', 'text', 'string', 'header', 'bytes', 'blob', 'json', 'path', 'hash']);
const secretSuffixPattern = [...secretSuffixes].join('|');
const directSecretField = new RegExp(`(?:password|passphrase|secret|token|bearer|privatekey|privatepem|identityfile|credentials?|authorization|connectionstring)(?:${secretSuffixPattern})?s?$`);
const secretKeyField = new RegExp(`(?:api|client|ssh|access|auth|private|secret|encryption|model|provider|master|signing|hmac)key(?:${secretSuffixPattern})?s?$`);
const bareKeyField = new RegExp(`^key(?:${secretSuffixPattern})?s?$`);
const secretField = (key) => {
  const { normalized, words } = keyParts(key);
  if (safeKeyMetadata.has(normalized)) return false;
  if (directSecretField.test(normalized)) return true;
  if (secretKeyField.test(normalized)) return true;
  const last = words.at(-1);
  const carrier = secretSuffixes.has(last) ? words.at(-2) : last;
  return bareKeyField.test(normalized) || ['pem', 'identity', 'credential'].includes(carrier);
};

const protectedContextKind = (key, value) => {
  const { normalized, words } = keyParts(key);
  const last = words.at(-1);
  const authenticationRoot = ['auth', 'authentication'].includes(words.at(0));
  const authenticationSuffix = ['auth', 'authentication'].includes(last);
  const authenticationNamespace = /^(?:auth|authentication)(?:config|configuration|settings?|options?|context|details?|profile|params|parameters)?$/.test(normalized);
  if (authenticationNamespace || authenticationSuffix || (authenticationRoot && (words.length === 1 || (value !== null && typeof value === 'object')))) return 'authentication';
  if (/^connections?(?:config|configuration|settings?|options?|context|details?|profile|params|parameters|pool)?$/.test(normalized)
    || ['connection', 'connections'].includes(last)) return 'connection';
  return undefined;
};

const authenticationMetadata = new Map([
  ['mode', field('string')], ['audience', field('string')], ['scheme', field('string')], ['type', field('string')],
  ['method', field('string')], ['strategy', field('string')], ['enabled', field('boolean')], ['issuer', field('string')],
  ['scope', field('string')], ['scopes', stringList],
]);
const connectionMetadata = new Map([
  ['host', field('string')], ['port', field('positiveInteger')], ['tls', field('boolean')], ['protocol', field('string')],
  ['timeout', field('positiveInteger')], ['pool', field('boolean')], ['poolenabled', field('boolean')],
  ['keepalive', field('boolean')], ['keepaliveenabled', field('boolean')],
]);
const protectedContextMetadataSchema = (contextKind, key) => {
  const { normalized } = keyParts(key);
  return (contextKind === 'authentication' ? authenticationMetadata : connectionMetadata).get(normalized);
};

const REFERENCE_ONLY_SCHEMA = object({ credentialRef, apiKeyEnv });
const MODEL_SCHEMA = object({
  provider: field('identifier'), modelId: field('string'), api: field('identifier'), baseUrl: field('httpUrl'),
  contextWindow: field('contextWindow'), maxTokens: field('positiveInteger'), credentialRef, apiKeyEnv,
});

const protectedNamespaceSchema = (key, value) => {
  const { normalized, words } = keyParts(key);
  const last = words.at(-1);
  const contextKind = protectedContextKind(key, value);
  if (/^models?(?:config|configuration|settings?|options?|context)?$/.test(normalized)) return MODEL_SCHEMA;
  if (/^ssh(?:config|configuration|settings?|options?|context|auth|credentials?)?$/.test(normalized)) return closedNamespace;
  if (contextKind === 'authentication' && Array.isArray(value)) return array(jsonObject);
  if (/^(?:authorization|credentials?)(?:config|configuration|settings?|options?|context|details?|profile|params|parameters|store|pool)?$/.test(normalized)) return REFERENCE_ONLY_SCHEMA;
  if (['authorization', 'credential', 'credentials'].includes(last)) return REFERENCE_ONLY_SCHEMA;
  if (contextKind) return jsonObject;
  return undefined;
};

// Known namespaces keep their product-level types. The root fallback preserves
// forward-compatible structured overrides, while credential-capable namespaces
// remain closed and generic fields still reject secret carriers recursively.
const CONFIG_SCHEMA = object({
  theme: field('string'),
  context: object({ maxMessages: field('positiveInteger'), tags: array(field('string')), retainPolicy: field('boolean') }),
  harness: object({ id: field('identifier') }),
  permissions: object({ network: field('boolean') }),
  model: MODEL_SCHEMA,
  ssh: closedNamespace,
}, json);

async function optionalText(path, label) {
  let handle;
  try {
    const entry = await lstat(path);
    if (!entry.isFile()) throw new Error(`${label} must be a regular file`);
    handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile()) throw new Error(`${label} must be a regular file`);
    if (info.size > maxBytes) throw new Error(`${label} is too large`);
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw new Error(`${label} is too large`);
    return buffer.subarray(0, length).toString('utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
    throw error;
  } finally {
    await handle?.close();
  }
}

function validateScalar(value, schema, scope, path, addBytes) {
  const label = path.join('.') || '<root>';
  if (schema.kind === 'string') {
    if (typeof value !== 'string') throw invalid(scope, `expected string at ${label}`);
    addBytes(value); return;
  }
  if (schema.kind === 'identifier') {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw invalid(scope, `expected identifier at ${label}`);
    addBytes(value); return;
  }
  if (schema.kind === 'httpUrl') {
    if (typeof value !== 'string') throw invalid(scope, `expected HTTP URL at ${label}`);
    let url;
    try { url = new URL(value); } catch { throw invalid(scope, `expected HTTP URL at ${label}`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid(scope, `expected HTTP URL at ${label}`);
    addBytes(value); return;
  }
  if (schema.kind === 'positiveInteger') {
    if (!Number.isSafeInteger(value) || value < 1) throw invalid(scope, `expected positive integer at ${label}`);
    return;
  }
  if (schema.kind === 'contextWindow') {
    if (!Number.isSafeInteger(value) || value < 1024) throw invalid(scope, `expected context window of at least 1024 at ${label}`);
    return;
  }
  if (schema.kind === 'boolean') {
    if (typeof value !== 'boolean') throw invalid(scope, `expected boolean at ${label}`);
    return;
  }
  if (schema.kind === 'credentialRef') {
    if (typeof value !== 'string' || !credentialReference.test(value)) throw invalid(scope, `invalid credentialRef at ${label}`);
    addBytes(value); return;
  }
  if (schema.kind === 'apiKeyEnv') {
    if (typeof value !== 'string' || !environmentName.test(value) || !isAllowedModelApiKeyEnvironment(value)) throw invalid(scope, `invalid apiKeyEnv at ${label}`);
    addBytes(value); return;
  }
  if (schema.kind === 'closedNamespace') throw invalid(scope, `unknown WeWork config field at ${label}`);
  throw invalid(scope, `unsupported configuration field at ${label}`);
}

function validateJsonScalar(value, scope, path, addBytes) {
  const label = path.join('.') || '<root>';
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { addBytes(value); return; }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  throw invalid(scope, `non-JSON value at ${label}`);
}

function validateLayer(value, scope) {
  if (!plain(value)) throw invalid(scope, 'root must be a plain object');
  const seen = new WeakSet();
  const pending = [{ value, schema: CONFIG_SCHEMA, path: [], depth: 0, contextKind: undefined }];
  let values = 0;
  let bytes = 0;
  const addBytes = (text) => {
    bytes += Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) throw invalid(scope, 'configuration is too large');
  };

  while (pending.length) {
    const current = pending.pop();
    const { value: item, path, depth, contextKind } = current;
    let { schema } = current;
    if (++values > maxValues) throw invalid(scope, 'configuration has too many values');
    if (schema.kind === 'json') {
      if (item === null || typeof item !== 'object') {
        validateJsonScalar(item, scope, path, addBytes);
        continue;
      }
      if (Array.isArray(item)) schema = jsonArray;
      else if (plain(item)) schema = jsonObject;
      else throw invalid(scope, `non-JSON value at ${path.join('.') || '<root>'}`);
    }
    if (schema.kind !== 'object' && schema.kind !== 'array') {
      validateScalar(item, schema, scope, path, addBytes);
      continue;
    }
    if (depth > maxDepth) throw invalid(scope, `configuration exceeds maximum depth at ${path.join('.')}`);
    if (seen.has(item)) throw invalid(scope, `cyclic value at ${path.join('.') || '<root>'}`);

    if (schema.kind === 'object') {
      if (!plain(item)) throw invalid(scope, `expected object at ${path.join('.') || '<root>'}`);
      if (schema === MODEL_SCHEMA && item.credentialRef !== undefined && item.apiKeyEnv !== undefined) throw invalid(scope, `model credentialRef and apiKeyEnv are mutually exclusive at ${path.join('.') || 'model'}`);
      seen.add(item);
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        if (values + pending.length >= maxValues) throw invalid(scope, 'configuration has too many values');
        if (unsafeKeys.has(key)) throw new Error(`unsafe configuration key is not allowed in WeWork config: ${[...path, key].join('.')}`);
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !('value' in descriptor)) throw invalid(scope, `non-JSON value at ${[...path, key].join('.')}`);
        const known = Object.hasOwn(schema.fields, key);
        let childSchema = known ? schema.fields[key] : schema.additional;
        if (!known && key === 'credentialRef') childSchema = credentialRef;
        if (!known && key === 'apiKeyEnv') childSchema = apiKeyEnv;
        const nestedContextKind = protectedContextKind(key, descriptor.value);
        let childContextKind = nestedContextKind || contextKind;
        let protectedSchema;
        if (!known && childSchema && key !== 'credentialRef' && key !== 'apiKeyEnv') {
          protectedSchema = protectedNamespaceSchema(key, descriptor.value);
          if (protectedSchema) childSchema = protectedSchema;
          if (secretField(key) && !(protectedSchema && (plain(descriptor.value) || Array.isArray(descriptor.value)))) childSchema = undefined;
        }
        if (protectedSchema === REFERENCE_ONLY_SCHEMA) childContextKind = undefined;
        if (contextKind && key !== 'credentialRef' && key !== 'apiKeyEnv') {
          childSchema = nestedContextKind ? (protectedSchema || jsonObject) : protectedContextMetadataSchema(contextKind, key);
        }
        if (!childSchema) throw invalid(scope, `unknown WeWork config field at ${[...path, key].join('.')}`);
        addBytes(key);
        pending.push({ value: descriptor.value, schema: childSchema, path: [...path, key], depth: depth + 1, contextKind: childContextKind });
      }
      continue;
    }

    if (!Array.isArray(item)) throw invalid(scope, `expected array at ${path.join('.')}`);
    if (seen.has(item)) throw invalid(scope, `cyclic value at ${path.join('.')}`);
    seen.add(item);
    if (item.length > maxValues - values - pending.length) throw invalid(scope, 'configuration has too many values');
    for (const key in item) {
      if (!Object.hasOwn(item, key)) continue;
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length) throw invalid(scope, `non-JSON array value at ${[...path, key].join('.')}`);
    }
    for (let index = item.length - 1; index >= 0; index -= 1) {
      const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
      if (!descriptor || !('value' in descriptor)) throw invalid(scope, `non-JSON array value at ${[...path, index].join('.')}`);
      pending.push({ value: descriptor.value, schema: schema.item, path: [...path, index], depth: depth + 1, contextKind });
    }
  }
  return value;
}

function merge(base, override) {
  if (!plain(override)) return structuredClone(override);
  const result = plain(base) ? structuredClone(base) : {};
  for (const [key, value] of Object.entries(override)) {
    const merged = plain(value) ? merge(result[key], value) : structuredClone(value);
    Object.defineProperty(result, key, { value: merged, writable: true, enumerable: true, configurable: true });
  }
  return result;
}

async function readConfig(path, scope) {
  const text = await optionalText(path, `${scope} WeWork config`);
  if (text === undefined) return undefined;
  try {
    return validateLayer(JSON.parse(text), scope);
  } catch (error) {
    if (/unsafe configuration key/i.test(error.message)) throw error;
    throw invalid(scope, error.message);
  }
}

export async function resolveWeWorkConfiguration({ configRoot, teamRoot, employeeRoot, sessionConfig, taskConfig, builtInConfig = WEWORK_BUILT_IN_CONFIG }) {
  const layers = [
    ['global', configRoot && join(configRoot, 'config.json'), configRoot && join(configRoot, 'WEWORK.md')],
    ['team', teamRoot && join(teamRoot, '.wework', 'config.json'), teamRoot && join(teamRoot, 'WEWORK.md')],
    ['employee', employeeRoot && join(employeeRoot, '.wework', 'config.json'), employeeRoot && join(employeeRoot, 'WEWORK.md')],
  ];
  let config = merge({}, validateLayer(builtInConfig, 'built-in'));
  const prompts = [];
  for (const [scope, configPath, promptPath] of layers) {
    if (configPath) { const value = await readConfig(configPath, scope); if (value) config = merge(config, value); }
    if (promptPath) { const content = await optionalText(promptPath, `${scope} WEWORK.md`); if (content?.trim()) prompts.push({ scope, path: promptPath, content: content.trim() }); }
  }
  for (const [scope, value] of [['session', sessionConfig], ['task', taskConfig]]) if (value !== undefined) config = merge(config, validateLayer(value, scope));
  return { config: validateLayer(config, 'effective'), prompts };
}
