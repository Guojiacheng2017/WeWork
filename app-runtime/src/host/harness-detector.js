import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { scrubHostChildEnvironment } from './process.js';
import { windowsCommandInvocation } from '../windows-command.js';

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
const errorText = (error) => `${error?.code ? `${error.code}: ` : ''}${error instanceof Error ? error.message : String(error)}`;
const macOsExecutableCandidates = (command) => [`/opt/homebrew/bin/${command}`, `/usr/local/bin/${command}`];

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
  constructor({ platform = process.platform, run = runProcess, readText = (path) => readFile(path, 'utf8'), home = homedir(), env = process.env, bundledSdh = async () => false, windowsCommandWrapperPath } = {}) {
    this.platform = platform; this.run = run; this.readText = readText; this.home = home; this.env = env;
    this.bundledSdh = bundledSdh;
    this.windowsCommandWrapperPath = windowsCommandWrapperPath;
  }

  async configuration(harness) {
    const parts = CONFIG_FILES[harness];
    let text = '';
    if (parts) try { text = await this.readText(join(this.home, ...parts)); } catch {}
    return parseConfiguration(harness, text, this.env);
  }

  async executable(spec) {
    const lookup = this.platform === 'win32' ? 'where.exe' : 'which';
    const diagnostics = { lookupCommand: `${lookup} ${spec.command}`, path: this.env.PATH ?? this.env.Path ?? '', candidates: [], attempts: [] };
    try {
      const environment = scrubHostChildEnvironment(this.env);
      let located;
      try { located = await this.run(lookup, [spec.command], { timeoutMs: 1000, environment }); }
      catch (error) {
        if (this.platform !== 'darwin') return { id: `harness:${spec.harness}`, harness: spec.harness, kind: spec.kind, available: false, executionReady:false, weworkToolsReady:false, reason: `${diagnostics.lookupCommand} 失败：${errorText(error)}`, diagnostics, capabilities: {streaming:false,resumeSession:false,cancellation:false,workspace:false,tools:false} };
        diagnostics.lookupError = errorText(error);
      }
      const locatedCandidates = located?.stdout?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];
      const candidates = [...new Set([...locatedCandidates, ...(this.platform === 'darwin' ? macOsExecutableCandidates(spec.command) : [])])];
      diagnostics.candidates = candidates;
      if (!candidates.length) throw new Error('empty executable path');
      for (const executablePath of candidates) try {
        const invocation = this.platform === 'win32'
          ? windowsCommandInvocation(executablePath, ['--version'], this.windowsCommandWrapperPath)
          : { file: executablePath, args: ['--version'] };
        const versionResult = await this.run(invocation.file, invocation.args, { timeoutMs: 1500, environment });
        const version = `${versionResult.stdout || versionResult.stderr}`.trim().split(/\r?\n/)[0] || undefined;
        const adapted = spec.harness === 'pi';
        return { id: `harness:${spec.harness}`, harness: spec.harness, kind: spec.kind, available: true, executionReady: adapted, weworkToolsReady: adapted, reason: adapted ? 'Verified through the WeWork Pi RPC adapter' : 'Installed; no verified WeWork execution adapter', executablePath, version, diagnostics, capabilities: adapted ? CAPABILITIES[spec.harness] : {streaming:false,resumeSession:false,cancellation:false,workspace:false,tools:false}, configuration: await this.configuration(spec.harness) };
      } catch (error) { diagnostics.attempts.push({ executablePath, error: errorText(error) }); }
      throw new Error(`${candidates.length} 个候选命令均无法运行`);
    } catch (error) {
      return { id: `harness:${spec.harness}`, harness: spec.harness, kind: spec.kind, available: false, executionReady:false, weworkToolsReady:false, reason: error instanceof Error ? error.message : String(error), diagnostics, capabilities: {streaming:false,resumeSession:false,cancellation:false,workspace:false,tools:false} };
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
