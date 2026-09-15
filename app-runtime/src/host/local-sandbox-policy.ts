export type LocalSandboxMode = 'ask' | 'auto' | 'full';
export type LocalSandboxAdapter = 'codex-cli' | 'pi' | 'smalldash';

export type LocalSandboxPolicy = {
  kind: 'local';
  mode: LocalSandboxMode;
  workspaceRoot: string;
  filesystem: {
    access: 'workspace-write' | 'full-access';
    writableRoots: string[];
  };
  network: { access: 'restricted' | 'public' };
  approvals: {
    policy: 'on-request' | 'never';
    reviewer: 'user' | 'none';
  };
  tools: { wework: 'read-only' | 'standard' | 'full' };
};

export type LocalSandboxProjection = {
  enforcement: 'native' | 'policy-only';
  cwd: string;
  args: string[];
  environment: Record<string, string>;
};

const modes = new Set<LocalSandboxMode>(['ask', 'auto', 'full']);
const adapters = new Set<LocalSandboxAdapter>(['codex-cli', 'pi', 'smalldash']);

function invalidPolicy(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'LOCAL_SANDBOX_POLICY_INVALID' });
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && (
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('\\\\')
  );
}

export function createLocalSandboxPolicy(
  mode: LocalSandboxMode,
  workspaceRoot: string,
): LocalSandboxPolicy {
  if (!modes.has(mode)) throw invalidPolicy('unknown local sandbox mode');
  if (!isAbsolutePath(workspaceRoot)) throw invalidPolicy('local sandbox workspace root must be absolute');

  if (mode === 'full') return {
    kind: 'local', mode, workspaceRoot,
    filesystem: { access: 'full-access', writableRoots: [] },
    network: { access: 'public' },
    approvals: { policy: 'never', reviewer: 'none' },
    tools: { wework: 'full' },
  };

  return {
    kind: 'local', mode, workspaceRoot,
    filesystem: { access: 'workspace-write', writableRoots: [workspaceRoot] },
    network: { access: 'restricted' },
    approvals: mode === 'ask'
      ? { policy: 'on-request', reviewer: 'user' }
      : { policy: 'never', reviewer: 'none' },
    tools: { wework: mode === 'ask' ? 'read-only' : 'standard' },
  };
}

export function projectLocalSandboxPolicy(
  policy: LocalSandboxPolicy,
  adapter: LocalSandboxAdapter,
): LocalSandboxProjection {
  if (!policy || policy.kind !== 'local' || !modes.has(policy.mode)) throw invalidPolicy('invalid local sandbox policy');
  if (!adapters.has(adapter)) throw invalidPolicy('unsupported local sandbox adapter');
  if (!isAbsolutePath(policy.workspaceRoot)) throw invalidPolicy('local sandbox workspace root must be absolute');

  if (adapter === 'codex-cli') return {
    enforcement: 'native',
    cwd: policy.workspaceRoot,
    args: [
      '--sandbox', policy.filesystem.access === 'full-access' ? 'danger-full-access' : 'workspace-write',
      '--ask-for-approval', policy.approvals.policy,
    ],
    environment: {},
  };

  return {
    enforcement: 'policy-only',
    cwd: policy.workspaceRoot,
    args: [],
    environment: {
      WEWORK_SANDBOX_NETWORK: policy.network.access,
      WEWORK_SANDBOX_TOOL_ACCESS: policy.tools.wework,
    },
  };
}
