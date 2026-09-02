import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { scrubHostChildEnvironment } from './process.js';

const CAPABILITIES = Object.freeze({
  pi: { streaming: true, resumeSession: true, cancellation: true, workspace: true, tools: true },
  'claude-code': { streaming: true, resumeSession: true, cancellation: true, workspace: true, tools: true },
  'codex-cli': { streaming: true, resumeSession: true, cancellation: true, workspace: true, tools: true },
  'gemini-cli': { streaming: true, resumeSession: true, cancellation: true, workspace: true, tools: true },
  smalldashharness: { streaming: true, resumeSession: false, cancellation: true, workspace: true, tools: true },
});

const EXECUTABLES = Object.freeze([
  { harness: 'pi', command: 'pi', kind: 'executable' },
  { harness: 'claude-code', command: 'claude', kind: 'executable' },
  { harness: 'codex-cli', command: 'codex', kind: 'executable' },
  { harness: 'gemini-cli', command: 'gemini', kind: 'executable' },
]);

const CONFIG_FILES = Object.freeze({
  'claude-code': ['.claude', 'settings.json'],
  'codex-cli': ['.codex', 'config.toml'],
  'gemini-cli': ['.gemini', 'settings.json'],
});

const firstString = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim();

function parseConfiguration(harness, text, env) {
  if (harness === 'claude-code') {
    let settings = {};
    try { settings = JSON.parse(text); } catch {}
    return { source: 'harness', provider: 'anthropic', modelId: firstString(env.ANTHROPIC_MODEL, settings.model, settings.env?.ANTHROPIC_MODEL) };
  }
  if (harness === 'codex-cli') {
    const value = (key) => text.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'm'))?.[1];
    return { source: 'harness', provider: firstString(value('model_provider'), 'openai'), modelId: value('model') };
  }
  if (harness === 'gemini-cli') {
    let settings = {};
    try { settings = JSON.parse(text); } catch {}
    return { source: 'harness', provider: 'google', modelId: firstString(env.GEMINI_MODEL, settings.model?.name, settings.model) };
  }
  return { source: harness === 'pi' ? 'harness' : 'service' };
}

function runProcess(file, args, { timeoutMs = 1500, environment = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false, windowsHide: true, env: scrubHostChildEnvironment(environment), stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = []; const stderr = [];
    const timer = setTimeout(() => { child.kill(); reject(Object.assign(new Error('probe timed out'), { code: 'HARNESS_PROBE_TIMEOUT' })); }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      const result = { stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(result.stderr.trim() || `probe exited ${code}`), { code: 'HARNESS_PROBE_FAILED' }));
    });
  });
}

export class HarnessDetector {
  constructor({ platform = process.platform, run = runProcess, readText = (path) => readFile(path, 'utf8'), home = homedir(), env = process.env, bundledSdh = async () => false } = {}) {
    this.platform = platform; this.run = run; this.readText = readText; this.home = home; this.env = env;
    this.bundledSdh = bundledSdh;
  }

  async configuration(harness) {
    const parts = CONFIG_FILES[harness];
    let text = '';
    if (parts) try { text = await this.readText(join(this.home, ...parts)); } catch {}
    return parseConfiguration(harness, text, this.env);
  }

  async executable(spec) {
    const lookup = this.platform === 'win32' ? 'where.exe' : 'which';
    try {
      const environment = scrubHostChildEnvironment(this.env);
      const located = await this.run(lookup, [spec.command], { timeoutMs: 1000, environment });
      const executablePath = located.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (!executablePath) throw new Error('empty executable path');
      const versionResult = await this.run(executablePath, ['--version'], { timeoutMs: 1500, environment });
      const version = `${versionResult.stdout || versionResult.stderr}`.trim().split(/\r?\n/)[0] || undefined;
      // A successful --version is installation evidence, not protocol/tool support.
      const ready = spec.harness === 'pi';
      return { id: `harness:${spec.harness}`, harness: spec.harness, kind: spec.kind, available: true, executionReady: ready, weworkToolsReady: ready, reason: ready ? 'Verified Pi RPC adapter; authentication and models are managed by Pi' : 'Installed; WeWork execution adapter is not yet verified', executablePath, version, capabilities: ready ? CAPABILITIES.pi : {streaming:false,resumeSession:false,cancellation:false,workspace:false,tools:false}, configuration: await this.configuration(spec.harness) };
    } catch {
      return { id: `harness:${spec.harness}`, harness: spec.harness, kind: spec.kind, available: false, executionReady:false, weworkToolsReady:false, capabilities: {streaming:false,resumeSession:false,cancellation:false,workspace:false,tools:false} };
    }
  }

  async detect() {
    const bundled = await this.bundledSdh().catch(()=>false);
    return [
      { id: 'harness:smalldashharness', harness: 'smalldashharness', kind: 'embedded', available: bundled, executionReady:bundled, weworkToolsReady:bundled, version: bundled ? 'WeWork bundled' : undefined, capabilities:{streaming:bundled,resumeSession:bundled,cancellation:bundled,workspace:bundled,tools:bundled}, configuration: { source: 'wework' } },
      ...(await Promise.all(EXECUTABLES.map((spec) => this.executable(spec)))),
    ];
  }
}
