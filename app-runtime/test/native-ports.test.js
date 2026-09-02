import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MacDirectoryService } from "../src/host/directory.js";
import { MacKeychainVault } from "../src/host/keychain.js";
import { createSshWorkspaceProbe, OpenSshService } from "../src/host/ssh.js";
import { scrubHostChildEnvironment } from '../src/host/process.js';

test('child process environments never inherit Host bearer or listener variables', () => {
  assert.deepEqual(scrubHostChildEnvironment({ WEWORK_HOST_TOKEN: 'bearer', WEWORK_HOST_PORT: '8790', PATH: '/bin', OPENAI_API_KEY: 'model' }), { PATH: '/bin', OPENAI_API_KEY: 'model' });
});

test("directory chooser uses osascript and returns POSIX path", async () => {
  const calls = [];
  const service = new MacDirectoryService({ cwd: () => "/repo", exec: async (file, args) => { calls.push([file, args]); return { stdout: "/chosen\n" }; } });
  assert.deepEqual(await service.currentDirectory(), { kind: "local", rootPath: "/repo" });
  assert.deepEqual(await service.chooseDirectory(), { kind: "local", rootPath: "/chosen" });
  assert.equal(calls[0][0], "osascript");
});

test('chosen App current directory persists across Host restarts and cancellation keeps it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-current-directory-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, '.wework', 'current-workspace.json');
  const first = new MacDirectoryService({ configPath, cwd: () => '/launch-one', exec: async () => ({ stdout: '/chosen\n' }) });
  assert.deepEqual(await first.chooseDirectory(), { kind: 'local', rootPath: '/chosen' });
  const restarted = new MacDirectoryService({ configPath, cwd: () => '/launch-two', exec: async () => ({ stdout: '\n' }) });
  assert.deepEqual(await restarted.currentDirectory(), { kind: 'local', rootPath: '/chosen' });
  assert.equal(await restarted.chooseDirectory(), null);
  assert.deepEqual(await restarted.currentDirectory(), { kind: 'local', rootPath: '/chosen' });
});

test('a present corrupt current-directory selection fails closed instead of using launch CWD', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-current-directory-corrupt-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, 'current-workspace.json');
  await writeFile(configPath, '{broken');
  const service = new MacDirectoryService({ configPath, cwd: () => '/unsafe-launch-directory' });

  await assert.rejects(() => service.currentDirectory(), /JSON|current Workspace/i);
});

test("keychain lists metadata but resolves secret internally", async () => {
  const values = new Map();
  const service = new MacKeychainVault({ exec: async (file, args, options) => {
    assert.equal(file, "security");
    const account = args[args.indexOf("-a") + 1];
    if (args[0] === "add-generic-password") { values.set(account, options.input); return { stdout: "" }; }
    return { stdout: values.get(account) };
  } });
  const created = await service.createCredential({ label: "GPU", kind: "ssh-private-key", secret: "PRIVATE" });
  assert.deepEqual(await service.listCredentials(), [{ ref: created.ref, label: "GPU", kind: "ssh-private-key" }]);
  assert.equal(await service.resolveCredential(created.ref), "PRIVATE");
  assert.doesNotMatch(JSON.stringify(await service.listCredentials()), /PRIVATE/);
});

test("ssh probe uses BatchMode and never puts a secret in argv", async () => {
  const calls = [];
  const ssh = new OpenSshService({ exec: async (file, args) => { calls.push([file, args]); return { stdout: "/work\n" }; } });
  const result = await ssh.probe({ host: "gpu", port: 22, username: "alice", rootPath: "/work", secret: "/keys/id_ed25519", credentialKind: "ssh-private-key" });
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], "ssh");
  assert.ok(calls[0][1].includes("BatchMode=yes"));
  assert.ok(!calls[0][1].includes("PRIVATE"));
  assert.ok(calls[0][1].includes("--"));
});

test('Host SSH probe wiring normalizes assignments and resolves only SSH Vault credentials', async () => {
  const calls = [];
  const probe = createSshWorkspaceProbe({
    vault: {
      listCredentials: async () => [
        { ref: 'vault:ssh/team', kind: 'ssh-private-key' },
        { ref: 'vault:model/team', kind: 'model-api-key' },
      ],
      resolveCredential: async (ref) => { calls.push(['resolve', ref]); return '/keys/team'; },
    },
    ssh: { probe: async (request) => { calls.push(['probe', request]); return { ok: true }; } },
  });

  assert.deepEqual(await probe({ kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work', credentialRef: 'vault:ssh/team' }), { ok: true });
  assert.deepEqual(calls, [
    ['resolve', 'vault:ssh/team'],
    ['probe', { kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work', credentialRef: 'vault:ssh/team', secret: '/keys/team', credentialKind: 'ssh-private-key' }],
  ]);
  await assert.rejects(() => probe({ kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work', credentialRef: 'vault:model/team' }), (error) => error.code === 'CREDENTIAL_MISSING');
});

test("ssh probe shell-quotes the remote root so command substitutions remain inert", async () => {
  const calls = [];
  const ssh = new OpenSshService({ exec: async (_file, args) => { calls.push(args); return { stdout: "/srv/safe\n" }; } });
  const result = await ssh.probe({ host: "gpu.example.com", port: 22, username: "alice", rootPath: "/srv/$(touch pwned)'quote", secret: "/keys/id", credentialKind: "ssh-private-key" });
  assert.equal(result.ok, true);
  const command = calls[0].at(-1);
  assert.equal(command, "cd '/srv/$(touch pwned)'\"'\"'quote' && pwd");
  assert.equal(calls[0].at(-2), "alice@gpu.example.com");
});

test("ssh probe rejects option-like destinations before spawning ssh", async () => {
  let called = false;
  const ssh = new OpenSshService({ exec: async () => { called = true; return { stdout: "" }; } });
  const result = await ssh.probe({ host: "gpu.example.com", port: 22, username: "-oProxyCommand", rootPath: "/work", secret: "x", credentialKind: "ssh-password" });
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("ssh password uses forced askpass without putting secret in argv or script", async () => {
  const calls = [];
  const ssh = new OpenSshService({ exec: async (file, args, options) => {
    calls.push({ file, args, options });
    return { stdout: "/srv/team\n" };
  } });
  const result = await ssh.probe({ host: "gpu", port: 22, username: "alice", rootPath: "/srv/team", secret: "p@ss word", credentialKind: "ssh-password" });
  assert.equal(result.ok, true);
  assert.equal(calls[0].file, "ssh");
  assert.equal(calls[0].options.env.WEWORK_SSH_PASSWORD, "p@ss word");
  assert.equal(calls[0].options.env.SSH_ASKPASS_REQUIRE, "force");
  assert.ok(!calls[0].args.join(" ").includes("p@ss word"));
  assert.ok(!calls[0].options.askpassScript.includes("p@ss word"));
});

test("ssh probe reports host-key and timeout failures without throwing", async () => {
  for (const message of ["Host key verification failed", "Connection timed out"]) {
    const ssh = new OpenSshService({ exec: async () => { throw new Error(message); } });
    const result = await ssh.probe({ host: "gpu", port: 22, username: "alice", rootPath: "/work", secret: "bad", credentialKind: "ssh-password" });
    assert.equal(result.ok, false);
    assert.equal(result.error, message);
  }
});
