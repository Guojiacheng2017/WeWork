import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalSandboxPolicy,
  projectLocalSandboxPolicy,
} from '../src/host/local-sandbox-policy.ts';

test('ask creates a workspace boundary with user-reviewed approvals and read-only WeWork tools', () => {
  assert.deepEqual(createLocalSandboxPolicy('ask', '/work/team-a'), {
    kind: 'local', mode: 'ask', workspaceRoot: '/work/team-a',
    filesystem: { access: 'workspace-write', writableRoots: ['/work/team-a'] },
    network: { access: 'restricted' },
    approvals: { policy: 'on-request', reviewer: 'user' },
    tools: { wework: 'read-only' },
  });
});

test('auto creates a non-interactive workspace policy with standard tools', () => {
  assert.deepEqual(createLocalSandboxPolicy('auto', '/work/team-a'), {
    kind: 'local', mode: 'auto', workspaceRoot: '/work/team-a',
    filesystem: { access: 'workspace-write', writableRoots: ['/work/team-a'] },
    network: { access: 'restricted' },
    approvals: { policy: 'never', reviewer: 'none' },
    tools: { wework: 'standard' },
  });
});

test('full explicitly removes restrictions while retaining the working directory', () => {
  const policy = createLocalSandboxPolicy('full', '/work/team-a');
  assert.deepEqual(projectLocalSandboxPolicy(policy, 'codex-cli'), {
    enforcement: 'native', cwd: '/work/team-a',
    args: ['--sandbox', 'danger-full-access', '--ask-for-approval', 'never'],
    environment: {},
  });
});

test('rejects invalid modes and non-absolute roots', () => {
  assert.throws(() => createLocalSandboxPolicy('automatic' as never, '/work/team-a'), { code: 'LOCAL_SANDBOX_POLICY_INVALID' });
  assert.throws(() => createLocalSandboxPolicy('auto', 'relative/team-a'), { code: 'LOCAL_SANDBOX_POLICY_INVALID' });
});

test('projects Codex natively and labels Pi and Smalldash as policy-only', () => {
  const policy = createLocalSandboxPolicy('ask', '/work/team-a');
  assert.deepEqual(projectLocalSandboxPolicy(policy, 'codex-cli'), {
    enforcement: 'native', cwd: '/work/team-a',
    args: ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'],
    environment: {},
  });
  for (const adapter of ['pi', 'smalldash'] as const) {
    assert.deepEqual(projectLocalSandboxPolicy(policy, adapter), {
      enforcement: 'policy-only', cwd: '/work/team-a', args: [],
      environment: { WEWORK_SANDBOX_NETWORK: 'restricted', WEWORK_SANDBOX_TOOL_ACCESS: 'read-only' },
    });
  }
});
