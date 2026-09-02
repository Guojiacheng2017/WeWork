import { describe, expect, it } from 'vitest';
import { MemoryCredentialVault, WeWorkHost, RuntimeCoordinator } from './weworkHost';

describe('WeWorkHost endpoint boundary', () => {
  it('lists credential metadata without exposing the secret', async () => {
    const vault = new MemoryCredentialVault();
    const ref = await vault.create({ label: 'Team GPU', kind: 'ssh-password', secret: 'super-secret' });
    expect(await vault.list()).toEqual([{ ref, label: 'Team GPU', kind: 'ssh-password' }]);
    expect(JSON.stringify(await vault.list())).not.toContain('super-secret');
    expect(await vault.resolve(ref)).toBe('super-secret');
  });

  it('uses the native picker for the current directory and resolves SSH only inside the host', async () => {
    const vault = new MemoryCredentialVault();
    const ref = await vault.create({ label: 'GPU', kind: 'ssh-password', secret: 'pw' });
    const seen: unknown[] = [];
    const host = new WeWorkHost({
      vault,
      directories: { current: async () => '/repo', choose: async () => '/chosen' },
      ssh: { test: async (request) => { seen.push(request); return { ok: true, latencyMs: 12, canonicalRoot: '/work' }; } },
    });
    expect(await host.currentWorkspace()).toEqual({ kind: 'local', rootPath: '/repo' });
    expect(await host.chooseLocalWorkspace()).toEqual({ kind: 'local', rootPath: '/chosen' });
    const result = await host.testSshWorkspace({ kind: 'ssh', host: 'gpu', port: 22, username: 'alice', rootPath: '/work', credentialRef: ref });
    expect(result.ok).toBe(true);
    expect(seen).toEqual([{ host: 'gpu', port: 22, username: 'alice', rootPath: '/work', secret: 'pw', credentialKind: 'ssh-password' }]);
  });

  it('publishes ordered run events and saves the portable checkpoint', async () => {
    const checkpoints: unknown[] = [];
    const coordinator = new RuntimeCoordinator({
      adapter: { run: async (spec, emit) => { emit({ type: 'assistant.delta', runId: spec.runId, text: 'working' }); return { messages: [{ role: 'assistant', content: 'done' }], finalText: 'done' }; } },
      saveCheckpoint: async (checkpoint) => { checkpoints.push(checkpoint); },
    });
    const events: string[] = [];
    coordinator.subscribe((event) => events.push(event.type));
    const result = await coordinator.run({ runId: 'run-1', employeeId: 'employee-1', workId: 'work-1', prompt: 'do it', checkpoint: { messages: [] } });
    expect(result.finalText).toBe('done');
    expect(events).toEqual(['run.started', 'assistant.delta', 'run.succeeded']);
    expect(checkpoints).toEqual([{ employeeId: 'employee-1', messages: [{ role: 'assistant', content: 'done' }] }]);
  });
});
