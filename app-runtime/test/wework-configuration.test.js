import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWeWorkConfiguration } from '../src/host/wework-configuration.js';

const put = async (root, relative, content) => { const path = join(root, relative); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, content); };
const execFileAsync = promisify(execFile);

test('merges structured defaults by scope and returns prompts in deterministic order', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, '.wework'); const teamRoot = join(root, 'WeWork', 'team'); const employeeRoot = join(teamRoot, 'employees', 'employee');
  await put(configRoot, 'config.json', JSON.stringify({ theme: 'dark', context: { maxMessages: 20, tags: ['global'] }, harness: { id: 'sdh' } }));
  await put(configRoot, 'WEWORK.md', 'Global instructions');
  await put(teamRoot, '.wework/config.json', JSON.stringify({ context: { tags: ['team'] }, permissions: { network: false } }));
  await put(teamRoot, 'WEWORK.md', 'Team instructions');
  await put(employeeRoot, '.wework/config.json', JSON.stringify({ context: { maxMessages: 8 } }));
  await put(employeeRoot, 'WEWORK.md', 'Employee instructions');

  const result = await resolveWeWorkConfiguration({ configRoot, teamRoot, employeeRoot, sessionConfig: { model: { modelId: 'm1' } }, taskConfig: { context: { tags: ['task'] } } });

  assert.deepEqual(result.config, { theme: 'dark', context: { maxMessages: 8, tags: ['task'] }, harness: { id: 'sdh' }, permissions: { network: false }, model: { modelId: 'm1' } });
  assert.deepEqual(result.prompts.map(({ scope, content }) => [scope, content]), [['global', 'Global instructions'], ['team', 'Team instructions'], ['employee', 'Employee instructions']]);
});

test('missing layers are optional while malformed, oversized and secret-bearing layers fail closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await resolveWeWorkConfiguration({ configRoot: join(root, 'missing') }), { config: {}, prompts: [] });
  await put(root, 'bad/.wework/config.json', '{ nope');
  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot: join(root, 'bad', '.wework') }), /invalid global WeWork config/i);
  await put(root, 'secret/.wework/config.json', JSON.stringify({ model: { apiKey: 'must-not-live-here' } }));
  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot: join(root, 'secret', '.wework') }), /unknown WeWork config field/i);
  await put(root, 'large/.wework/WEWORK.md', 'x'.repeat(65537));
  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot: join(root, 'large', '.wework') }), /too large/i);
});

test('applies built-in defaults before writable configuration layers', async () => {
  const result = await resolveWeWorkConfiguration({
    builtInConfig: { context: { maxMessages: 100, retainPolicy: true }, theme: 'built-in' },
    sessionConfig: { context: { maxMessages: 20 } },
    taskConfig: { theme: 'task' },
  });

  assert.deepEqual(result.config, { context: { maxMessages: 20, retainPolicy: true }, theme: 'task' });
});

test('rejects non-JSON nested session and task values', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { context: { maxMessages: new Date('2026-09-01T00:00:00.000Z') } } }), /invalid session WeWork config/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: { theme: () => undefined } }), /invalid task WeWork config/i);
});

test('accepts only plain session and task configuration layers', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: [] }), /invalid session WeWork config/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: new Date('2026-09-01T00:00:00.000Z') }), /invalid task WeWork config/i);
});

test('rejects direct credential fields in file, session, and task layers', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, '.wework');
  await put(configRoot, 'config.json', JSON.stringify({ transport: { sshPrivateKey: 'not-allowed' } }));

  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot }), /unknown WeWork config field/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { clientSecret: 'not-allowed' } } }), /unknown WeWork config field/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: { model: { api_key: 'not-allowed' } } }), /unknown WeWork config field/i);
});

test('rejects token, SSH-key, passphrase, and authorization fields', async () => {
  for (const key of ['accessToken', 'sshKey', 'passphrase', 'authorization']) {
    await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { [key]: 'not-allowed' } } }), /unknown WeWork config field/i, key);
  }
});

test('rejects credential-shaped bypass names', async () => {
  for (const key of ['privatePem', 'bearer', 'identity', 'credential', 'apiKeyRef']) {
    await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { [key]: 'not-allowed' } } }), /unknown WeWork config field/i, key);
  }
});

test('permits credential references and API-key environment-variable names', async () => {
  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig: { model: { credentialRef: 'vault:model' } } })).config, { model: { credentialRef: 'vault:model' } });
  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig: { model: { apiKeyEnv: 'WEWORK_MODEL_API_KEY' } } })).config, { model: { apiKeyEnv: 'WEWORK_MODEL_API_KEY' } });
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { credentialRef: 'vault:model', apiKeyEnv: 'WEWORK_MODEL_API_KEY' } } }), /credentialRef.*apiKeyEnv|credential source/i);
});

test('permits named non-secret runtime model settings', async () => {
  const result = await resolveWeWorkConfiguration({
    sessionConfig: { model: { provider: 'openai', modelId: 'gpt-5.6', api: 'openai-responses', baseUrl: 'http://localhost:8000/v1', contextWindow: 128000, maxTokens: 8192, credentialRef: 'keychain:credential-1' } },
  });

  assert.deepEqual(result.config.model, { provider: 'openai', modelId: 'gpt-5.6', api: 'openai-responses', baseUrl: 'http://localhost:8000/v1', contextWindow: 128000, maxTokens: 8192, credentialRef: 'keychain:credential-1' });
});

test('rejects inert model aliases instead of silently dropping them at execution', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { id: 'not-a-runtime-model-field' } } }), /unknown WeWork config field/i);
});

test('rejects credential ambiguity synthesized across configuration layers', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-credential-merge-')); t.after(() => rm(root, { recursive: true, force: true }));
  await put(root, 'config.json', JSON.stringify({ model: { credentialRef: 'vault:model' } }));
  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot: root, sessionConfig: { model: { apiKeyEnv: 'WEWORK_MODEL_API_KEY' } } }), /credentialRef.*apiKeyEnv|credential source/i);
});

test('enforces executable lower bounds for context and model limits', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { context: { maxMessages: 0 } } }), /positive integer/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { maxTokens: 0 } } }), /positive integer/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { contextWindow: 1023 } } }), /context window/i);
});

test('deep-merges bounded non-secret fields outside known configuration namespaces', async () => {
  const result = await resolveWeWorkConfiguration({
    builtInConfig: {
      schedule: { window: { start: '09:00', days: ['monday'] }, retry: { maximum: 2 } },
      tools: { reviewer: { enabled: true, rules: ['built-in'] } },
    },
    sessionConfig: { schedule: { window: { start: '10:00' } }, tools: { reviewer: { rules: ['session'] } } },
    taskConfig: { schedule: { retry: { delaySeconds: 30 } }, tools: { reviewer: { strict: true } } },
  });

  assert.deepEqual(result.config, {
    schedule: { window: { start: '10:00', days: ['monday'] }, retry: { maximum: 2, delaySeconds: 30 } },
    tools: { reviewer: { enabled: true, rules: ['session'], strict: true } },
  });
});

test('keeps benign key, view-model, authentication, and connection metadata extensible', async () => {
  const sessionConfig = {
    cacheKey: 'cache-v2',
    primaryKey: 'record_id',
    foreignKey: 'team_id',
    partitionKey: 'wework-team',
    sortKey: 'created_at',
    routingKey: 'wework.work',
    viewModel: { density: 'compact' },
    plugin: { authentication: { mode: 'oauth', audience: 'wework' } },
    database: { connection: { host: 'db.internal', port: 5432, tls: true } },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('rejects raw header carriers in authentication and connection namespaces', async () => {
  for (const sessionConfig of [
    { plugin: { authentication: { header: 'Bearer raw-secret' } } },
    { extensions: { auth: { authHeader: 'Bearer raw-secret' } } },
    { plugin: { authentication: { authenticationHeader: 'Bearer raw-secret' } } },
    { database: { connection: { authHeader: 'Bearer raw-secret' } } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('rejects direct auth-prefixed raw carrier fields in authentication contexts', async () => {
  for (const key of ['authValue', 'authenticationData', 'authMaterial', 'authenticationContent', 'authText', 'authenticationString', 'authBytes', 'authenticationBlob', 'authJson', 'authenticationPath', 'authHash']) {
    await assert.rejects(
      () => resolveWeWorkConfiguration({ sessionConfig: { plugin: { authentication: { [key]: 'raw-secret' } } } }),
      /unknown WeWork config field/i,
      key,
    );
  }
});

test('treats exact auth-rooted suffix containers as typed authentication contexts', async () => {
  for (const sessionConfig of [
    { plugin: { authPool: { label: 'unreviewed metadata' } } },
    { plugin: { authenticationPool: { label: 'unreviewed metadata' } } },
    { plugin: { nested: { authBroker: { label: 'unreviewed metadata' } } } },
    { plugin: { providers: [{ authenticationBroker: { label: 'unreviewed metadata' } }] } },
    { plugin: { authenticationUnseenSuffix: { label: 'unreviewed metadata' } } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('retains normalized legacy authentication namespace aliases', async () => {
  for (const key of [
    'authconfig', 'authenticationconfiguration', 'authsettings', 'authenticationoptions', 'authcontext',
    'authenticationdetails', 'authprofile', 'authenticationparams', 'authparameters',
  ]) await assert.rejects(
    () => resolveWeWorkConfiguration({ sessionConfig: { plugin: { [key]: { authValue: 'raw-secret' } } } }),
    /unknown WeWork config field/i,
    key,
  );
});

test('fails closed for scalar legacy authentication namespaces while preserving scalar authenticationMode', async () => {
  for (const key of ['authConfig', 'authenticationparameters']) await assert.rejects(
    () => resolveWeWorkConfiguration({ sessionConfig: { plugin: { [key]: 'raw-secret' } } }),
    /expected object/i,
    key,
  );
  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig: { plugin: { authenticationMode: 'display metadata' } } })).config, { plugin: { authenticationMode: 'display metadata' } });
});

test('accepts typed metadata in direct auth-rooted array containers', async () => {
  const sessionConfig = {
    plugin: {
      authPool: [{ mode: 'oauth', audience: 'wework', credentialRef: 'vault:oauth' }],
      authenticationPool: [{ enabled: true, scopes: ['read:wework'], apiKeyEnv: 'WEWORK_MODEL_API_KEY' }],
    },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('rejects undocumented and raw values in direct auth-rooted array containers', async () => {
  for (const sessionConfig of [
    { plugin: { authPool: [{ label: 'unreviewed metadata' }] } },
    { plugin: { authenticationPool: [{ authValue: 'raw-secret' }] } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('accepts typed elements in secret- and reference-suffixed auth arrays', async () => {
  const sessionConfig = {
    plugin: {
      authKey: [{ mode: 'oauth', credentialRef: 'vault:oauth' }],
      authCredentials: [{ enabled: true, apiKeyEnv: 'WEWORK_MODEL_API_KEY' }],
    },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('rejects untyped elements in secret- and reference-suffixed auth arrays', async () => {
  for (const sessionConfig of [
    { plugin: { authKey: [{ authValue: 'raw-secret' }] } },
    { plugin: { authCredentials: [{ label: 'unreviewed metadata' }] } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('keeps auth credential objects reference-only and scalar secret carriers closed', async () => {
  assert.deepEqual(
    (await resolveWeWorkConfiguration({ sessionConfig: { plugin: { authCredentials: { credentialRef: 'vault:oauth' } } } })).config,
    { plugin: { authCredentials: { credentialRef: 'vault:oauth' } } },
  );
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { plugin: { authCredentials: { mode: 'oauth' } } } }), /unknown WeWork config field/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { plugin: { authKey: 'raw-secret' } } }), /unknown WeWork config field/i);
});

test('keeps SSH authentication arrays closed', async () => {
  for (const key of ['sshAuth', 'ssh-auth']) await assert.rejects(
    () => resolveWeWorkConfiguration({ sessionConfig: { plugin: { [key]: [{ mode: 'oauth', credentialRef: 'vault:ssh' }] } } }),
    /unknown WeWork config field/i,
    key,
  );
});

test('accepts typed auth-rooted arrays nested in an authentication context', async () => {
  const sessionConfig = {
    plugin: {
      authentication: {
        authPool: [{ mode: 'oauth', credentialRef: 'vault:oauth' }],
        authenticationPool: [{ enabled: true, apiKeyEnv: 'WEWORK_MODEL_API_KEY' }],
      },
    },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('rejects untyped values in auth-rooted arrays nested in an authentication context', async () => {
  for (const sessionConfig of [
    { plugin: { authentication: { authPool: [{ label: 'unreviewed metadata' }] } } },
    { plugin: { authentication: { authenticationPool: [{ authValue: 'raw-secret' }] } } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('retains authentication contexts with an exact final auth word', async () => {
  for (const sessionConfig of [
    { plugin: { clientAuth: { authValue: 'raw-secret' } } },
    { plugin: { oauthAuthentication: { authValue: 'raw-secret' } } },
    { plugin: { 'provider-auth': { authValue: 'raw-secret' } } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('allows authentication metadata but not author or authority containers as protected auth contexts', async () => {
  const sessionConfig = {
    plugin: {
      authPool: { mode: 'oauth', audience: 'wework', credentialRef: 'vault:oauth' },
      authenticationPool: { enabled: true, scopes: ['read:wework'], apiKeyEnv: 'WEWORK_MODEL_API_KEY' },
      authorPool: { label: 'ordinary extension metadata', authValue: 'display label' },
      authorityBroker: { label: 'ordinary extension metadata', authValue: 'display label' },
    },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('rejects nested authentication and array auth header carrier fields', async () => {
  for (const sessionConfig of [
    { database: { connection: { provider: { authenticationData: 'raw-secret' } } } },
    { extensions: { auth: { providers: [{ authHeaderValue: 'raw-secret' }] } } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('rejects qualified header and key carriers throughout protected contexts', async () => {
  for (const sessionConfig of [
    { plugin: { authentication: { requestHeader: 'Bearer raw-secret' } } },
    { plugin: { authentication: { defaultHeaders: ['Bearer raw-secret'] } } },
    { plugin: { authentication: { customHeaderValue: 'Bearer raw-secret' } } },
    { database: { connection: { requestHeader: 'Bearer raw-secret' } } },
    { plugin: { authentication: { authenticationKey: 'raw-secret' } } },
    { plugin: { authentication: { authHeaderKey: 'raw-secret' } } },
    { plugin: { authentication: { authenticationHeaderKey: 'raw-secret' } } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('fails closed for undocumented fields and wrong metadata types in protected contexts', async () => {
  for (const sessionConfig of [
    { plugin: { authentication: { label: 'unreviewed metadata' } } },
    { database: { connection: { databaseName: 'wework' } } },
    { plugin: { authentication: { enabled: 'yes' } } },
    { plugin: { authentication: { scopes: 'read:wework' } } },
    { database: { connection: { port: '5432' } } },
    { database: { connection: { keepAlive: 1 } } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /invalid session WeWork config/i);
});

test('accepts typed benign metadata and exact references in protected contexts', async () => {
  const sessionConfig = {
    plugin: {
      authentication: {
        mode: 'oauth', audience: 'wework', scheme: 'Bearer', type: 'oauth2', method: 'pkce', strategy: 'refresh',
        enabled: true, issuer: 'https://identity.example', scopes: ['read:wework', 'write:wework'], credentialRef: 'vault:oauth',
      },
    },
    database: {
      connection: {
        host: 'db.internal', port: 5432, tls: true, protocol: 'postgres', timeout: 30,
        pool: true, poolEnabled: true, keepAlive: true, keepAliveEnabled: false, apiKeyEnv: 'WEWORK_MODEL_API_KEY',
      },
    },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('preserves qualified header and key extension fields outside protected contexts', async () => {
  const sessionConfig = {
    presentation: {
      requestHeader: 'Quarterly report', defaultHeaders: ['Title', 'Owner'], customHeaderValue: 'Summary',
      authenticationKey: 'display-order', authHeaderKey: 'section-name', authenticationHeaderKey: 'column-name',
    },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('keeps auth mode and audience plus connection host, port, and TLS metadata extensible', async () => {
  const sessionConfig = {
    plugin: { authentication: { mode: 'oauth', audience: 'wework' } },
    database: { connection: { host: 'db.internal', port: 5432, tls: true } },
    presentation: { header: 'WeWork settings' },
    extensions: { integration: { authValue: 'ordinary extension metadata', authenticationMode: 'ordinary extension metadata', headerValue: 'display title' } },
  };

  assert.deepEqual((await resolveWeWorkConfiguration({ sessionConfig })).config, sessionConfig);
});

test('ordinary auth and connection objects stay extensible while scalar secret carriers are rejected', async () => {
  for (const sessionConfig of [
    { extensions: { auth: 'Bearer raw-secret' } },
    { authentication: 'raw-secret' },
    { database: { connection: 'postgres://user:pass@host/db' } },
    { connectionString: 'postgres://user:pass@host/db' },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /invalid session WeWork config/i);
});

test('accepts hierarchical credential references while still rejecting nested raw secret carriers', async () => {
  const credentialRef = 'keychain:team/model/provider/key-1';
  assert.equal((await resolveWeWorkConfiguration({ sessionConfig: { model: { credentialRef } } })).config.model.credentialRef, credentialRef);
  for (const sessionConfig of [
    { database: { connection: { password: 'raw-secret' } } },
    { plugin: { authentication: { accessToken: 'raw-secret' } } },
    { viewModel: { nested: { apiKey: 'raw-secret' } } },
    { extensions: { databasePassword: 'raw-secret' } },
    { extensions: { githubToken: 'raw-secret' } },
    { extensions: { serviceApiKey: 'raw-secret' } },
    { extensions: { encryptionKey: 'raw-secret' } },
    { extensions: { privateKeyContent: 'raw-secret' } },
    { extensions: { privatePemText: 'raw-secret' } },
    { extensions: { oauthTokenString: 'raw-secret' } },
    { extensions: { modelKey: 'raw-secret' } },
    { extensions: { providerKey: 'raw-secret' } },
    { extensions: { masterKey: 'raw-secret' } },
    { extensions: { signingKey: 'raw-secret' } },
    { extensions: { hmacKey: 'raw-secret' } },
  ]) await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
});

test('rejects model and SSH secret carriers beneath generic extension namespaces', async () => {
  const bypasses = [
    { deployment: { model: { key: 'sk-live-not-allowed' } } },
    { schedule: { model: { clientKey: 'sk-live-not-allowed' } } },
    { deployment: { sshConfig: { key: '-----BEGIN OPENSSH PRIVATE KEY-----' } } },
    { remote: { sshConfig: { credentialRef: 'vault:ssh' } } },
  ];

  for (const sessionConfig of bypasses) {
    await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /unknown WeWork config field/i);
  }
});

test('keeps model, credential-store, and malformed connection contexts closed', async () => {
  const sensitiveContexts = [
    { deployment: { credentials: { provider: 'inline' } } },
    { deployment: { model: { endpoint: 'https://models.example/v1' } } },
    { deployment: { model: { authentication: { credentialRef: 'vault:model' } } } },
    { transport: { connectionConfig: [{ password: 'raw-secret' }] } },
  ];

  for (const sessionConfig of sensitiveContexts) {
    await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig }), /invalid session WeWork config/i);
  }
});

test('rejects bare secret carriers anywhere while retaining safe generic extension data', async () => {
  for (const key of [
    'key', 'token', 'password', 'passphrase', 'privatePem', 'identityFile', 'clientKey', 'bearer',
    'authorizationHeader', 'apiKeyHeader', 'accessTokenHeader', 'oauthTokenHeader', 'privateKeyBytes',
    'signingKeyBytes', 'secretBlob', 'credentialJson', 'identityPath', 'passwordHash',
  ]) {
    await assert.rejects(
      () => resolveWeWorkConfiguration({ sessionConfig: { extensions: { nested: { [key]: 'not-allowed' } } } }),
      /unknown WeWork config field/i,
      key,
    );
  }

  const result = await resolveWeWorkConfiguration({
    sessionConfig: {
      extensions: {
        presentation: { keynote: { enabled: true }, keyboardLayout: 'dvorak' },
        references: { credentialRef: 'vault:model', apiKeyEnv: 'WEWORK_MODEL_API_KEY' },
      },
      deployment: {
        model: {
          modelId: 'Qwen/Qwen3',
          baseUrl: 'https://[2001:db8::1]:8443/v1/models',
          credentialRef: 'vault:model',
        },
      },
      access: { authentication: { credentialRef: 'vault:oauth' } },
      transport: { connectionConfig: { apiKeyEnv: 'WEWORK_MODEL_API_KEY' } },
    },
  });

  assert.deepEqual(result.config, {
    extensions: {
      presentation: { keynote: { enabled: true }, keyboardLayout: 'dvorak' },
      references: { credentialRef: 'vault:model', apiKeyEnv: 'WEWORK_MODEL_API_KEY' },
    },
    deployment: {
      model: {
        modelId: 'Qwen/Qwen3',
        baseUrl: 'https://[2001:db8::1]:8443/v1/models',
        credentialRef: 'vault:model',
      },
    },
    access: { authentication: { credentialRef: 'vault:oauth' } },
    transport: { connectionConfig: { apiKeyEnv: 'WEWORK_MODEL_API_KEY' } },
  });
});

test('accepts provider model IDs and standards-valid HTTP URLs', async () => {
  const result = await resolveWeWorkConfiguration({
    sessionConfig: { model: { modelId: 'Qwen/Qwen3', baseUrl: 'https://[2001:db8::1]:8443/v1/models?region=cn#catalog' } },
  });

  assert.deepEqual(result.config.model, { modelId: 'Qwen/Qwen3', baseUrl: 'https://[2001:db8::1]:8443/v1/models?region=cn#catalog' });
});

test('rejects non-HTTP and credential-bearing model URLs', async () => {
  for (const baseUrl of ['ftp://models.example/v1', 'https://user:secret@models.example/v1', 'https://models.example:99999/v1']) {
    await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { baseUrl } } }), /expected HTTP URL/i, baseUrl);
  }
});

test('rejects raw values in credential references and API-key environment names', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { credentialRef: 'sk-live-not-a-reference' } } }), /invalid credentialRef/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: { model: { apiKeyEnv: 'sk-live-not-an-environment-name' } } }), /invalid apiKeyEnv/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { extensions: { references: { credentialRef: 'raw-secret' } } } }), /invalid credentialRef/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: { access: { authentication: { apiKeyEnv: 'lowercase-name' } } } }), /invalid apiKeyEnv/i);
});

test('rejects unknown model and SSH credential carriers', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { key: 'sk-live-not-allowed' } } }), /unknown WeWork config field/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { clientKey: 'sk-live-not-allowed' } } }), /unknown WeWork config field/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: { ssh: { identityFile: '-----BEGIN OPENSSH PRIVATE KEY-----' } } }), /unknown WeWork config field/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: { ssh: { auth: 'private material' } } }), /unknown WeWork config field/i);
});

test('accepts only exact credential-reference and API-key-environment field names', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { model: { 'credential-ref': 'vault:model' } } }), /unknown WeWork config field/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: { model: { api_key_env: 'WEWORK_MODEL_API_KEY' } } }), /unknown WeWork config field/i);
});

test('rejects cyclic and over-deep session/task configuration values', async () => {
  const cyclic = {}; cyclic.self = cyclic;
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: cyclic }), /invalid session WeWork config/i);

  const deep = {}; let cursor = deep;
  for (let index = 0; index < 40; index += 1) { cursor.child = {}; cursor = cursor.child; }
  await assert.rejects(() => resolveWeWorkConfiguration({ taskConfig: deep }), /invalid task WeWork config/i);
});

test('bounds primitive values in large arrays before traversal', async () => {
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { context: { tags: Array(5000).fill('tag') } } }), /too many values/i);
});

test('rejects non-index array fields that can carry a secret', async () => {
  const entries = []; entries.accessToken = 'not-allowed';
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { context: { tags: entries } } }), /invalid session WeWork config/i);
});

test('rejects prototype-poisoning configuration keys', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, '.wework');
  await put(configRoot, 'config.json', '{"__proto__":{"permissions":{"network":true}}}');

  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot }), /unsafe configuration key/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: JSON.parse('{"constructor":{"prototype":{"admin":true}}}') }), /unsafe configuration key/i);
});

test('accepts exactly bounded JSON and rejects oversized JSON', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const acceptedRoot = join(root, 'accepted', '.wework');
  await put(acceptedRoot, 'config.json', `{"theme":"${'x'.repeat(65524)}"}`);
  assert.equal((await resolveWeWorkConfiguration({ configRoot: acceptedRoot })).config.theme.length, 65524);

  const oversizedRoot = join(root, 'oversized', '.wework');
  await put(oversizedRoot, 'config.json', `{"theme":"${'x'.repeat(65525)}"}`);
  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot: oversizedRoot }), /too large/i);
  await assert.rejects(() => resolveWeWorkConfiguration({ sessionConfig: { theme: 'x'.repeat(65536) } }), /configuration is too large/i);
});

test('omits empty WEWORK.md prompts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, '.wework'); await put(configRoot, 'WEWORK.md', ' \n\t ');

  assert.deepEqual((await resolveWeWorkConfiguration({ configRoot })).prompts, []);
});

test('rejects symlinked configuration files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, 'target.json'); const configRoot = join(root, '.wework');
  await writeFile(target, '{"theme":"from-target"}'); await mkdir(configRoot, { recursive: true }); await symlink(target, join(configRoot, 'config.json'));

  await assert.rejects(() => resolveWeWorkConfiguration({ configRoot }), /regular file/i);
});

test('rejects FIFO configuration files without waiting for a writer', { skip: process.platform === 'win32' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, '.wework'); const fifo = join(configRoot, 'config.json');
  await mkdir(configRoot, { recursive: true }); await execFileAsync('mkfifo', [fifo]);
  const moduleUrl = new URL('../src/host/wework-configuration.js', import.meta.url).href;
  const script = `import { resolveWeWorkConfiguration } from ${JSON.stringify(moduleUrl)}; try { await resolveWeWorkConfiguration({ configRoot: ${JSON.stringify(configRoot)} }); } catch (error) { console.log(error.message); }`;

  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], { timeout: 750 });
  assert.match(stdout, /regular file/i);
});
