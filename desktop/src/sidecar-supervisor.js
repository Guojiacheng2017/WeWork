import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { spawn as nodeSpawn } from "node:child_process";

export class SidecarSupervisor extends EventEmitter {
  constructor(options) {
    super();
    this.options = { spawn: nodeSpawn, randomToken: () => randomBytes(32).toString("hex"), restartDelayMs: 250, ...options };
    this.stopping = false; this.child = null; this.endpoint = null; this.token = null; this.restartTimer = null;
  }
  authorization() { if (!this.token) throw new Error("WeWork Host is not ready"); return `Bearer ${this.token}`; }
  async start() { this.stopping = false; return this.launch(); }
  launch() {
    const token = this.options.randomToken();
    const child = this.options.spawn(this.options.command, this.options.args, { env: { ...process.env, ...this.options.env, WEWORK_HOST_TOKEN: token, WEWORK_HOST_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    this.child = child; this.token = token;
    let buffer = "", settled = false;
    return new Promise((resolve, reject) => {
      const fail = (error) => { if (!settled) { settled = true; reject(error); } };
      child.stdout.setEncoding?.("utf8");
      child.stderr.setEncoding?.("utf8");
      child.stderr.on("data", (chunk) => this.emit("stderr", String(chunk)));
      child.stdout.on("data", (chunk) => {
        buffer += String(chunk);
        for (;;) {
          const newline = buffer.indexOf("\n"); if (newline < 0) break;
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          try {
            const message = JSON.parse(line);
            if (message.type === "wework-host.ready" && /^http:\/\/127\.0\.0\.1:\d+$/.test(message.url)) {
              settled = true; this.endpoint = { url: message.url }; this.emit("ready", this.endpoint); resolve(this.endpoint);
            }
          } catch { /* ignore non-protocol output */ }
        }
      });
      child.on("error", fail);
      child.on("exit", (code) => {
        if (this.child !== child) return;
        this.child = null; this.endpoint = null;
        if (!settled) fail(new Error(`WeWork Host exited before ready with code ${code}`));
        if (!this.stopping) this.restartTimer = setTimeout(() => { this.launch().catch((error) => this.emit("restart-error", error)); }, this.options.restartDelayMs);
      });
    });
  }
  async stop() {
    this.stopping = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null; this.endpoint = null; this.token = null;
    const child = this.child; this.child = null;
    if (child && !child.killed) child.kill("SIGTERM");
  }
}
