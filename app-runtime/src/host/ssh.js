import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execProcess, scrubHostChildEnvironment } from "./process.js";
import { normalizeWorkspaceAssignment } from '../../../src/domain/wework.ts';
const hostPattern = /^(?=.{1,253}$)(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)$/;
const userPattern = /^[A-Za-z_][A-Za-z0-9._-]{0,63}$/;
const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;

export function createSshWorkspaceProbe({ vault, ssh }) {
  return async (assignment) => {
    const normalized = normalizeWorkspaceAssignment(assignment);
    if (normalized?.kind !== 'ssh') throw new Error('SSH Workspace assignment is required');
    const metadata = (await vault.listCredentials()).find((item) => item.ref === normalized.credentialRef);
    if (!metadata || !['ssh-password', 'ssh-private-key'].includes(metadata.kind)) {
      const error = new Error('credential reference not found or has the wrong kind');
      error.code = 'CREDENTIAL_MISSING';
      throw error;
    }
    return ssh.probe({
      ...normalized,
      secret: await vault.resolveCredential(normalized.credentialRef),
      credentialKind: metadata.kind,
    });
  };
}

export class OpenSshService {
  constructor(ports = {}) { this.exec = ports.exec ?? execProcess; }
  async probe(request) {
    const started = Date.now(); let temp;
    try {
      if (!hostPattern.test(request.host) || !userPattern.test(request.username) || !Number.isSafeInteger(request.port) || request.port < 1 || request.port > 65535) throw new Error('invalid SSH destination');
      if (typeof request.rootPath !== 'string' || !request.rootPath.startsWith('/') || /[\x00-\x1f\x7f]/.test(request.rootPath)) throw new Error('invalid SSH root');
      const args = ["-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=accept-new", "-p", String(request.port)];
      let options = { env: scrubHostChildEnvironment() };
      if (request.credentialKind === "ssh-private-key") {
        let keyPath = request.secret;
        if (request.secret.includes("BEGIN ")) { temp = await mkdtemp(join(tmpdir(), "wework-ssh-")); keyPath = join(temp, "key"); await writeFile(keyPath, request.secret, { mode: 0o600 }); }
        args.push("-o", "BatchMode=yes", "-i", keyPath);
      } else {
        temp = await mkdtemp(join(tmpdir(), "wework-ssh-"));
        const askpass = join(temp, "askpass.sh");
        const askpassScript = '#!/bin/sh\nprintf "%s" "$WEWORK_SSH_PASSWORD"\n';
        await writeFile(askpass, askpassScript, { mode: 0o700 });
        args.push("-o", "BatchMode=no", "-o", "NumberOfPasswordPrompts=1", "-o", "PreferredAuthentications=password,keyboard-interactive");
        options = { askpassScript, env: { ...scrubHostChildEnvironment(), SSH_ASKPASS: askpass, SSH_ASKPASS_REQUIRE: "force", DISPLAY: process.env.DISPLAY || "wework", WEWORK_SSH_PASSWORD: request.secret } };
      }
      args.push("--", `${request.username}@${request.host}`, `cd ${shellQuote(request.rootPath)} && pwd`);
      const { stdout } = await this.exec("ssh", args, options);
      return { ok: true, latencyMs: Date.now() - started, canonicalRoot: stdout.trim() };
    } catch (error) { return { ok: false, latencyMs: Date.now() - started, error: error.message }; }
    finally { if (temp) await rm(temp, { recursive: true, force: true }); }
  }
}
