import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { SidecarSupervisor } from "../src/sidecar-supervisor.js";

class FakeStream extends EventEmitter { setEncoding() {} }
class FakeChild extends EventEmitter {
  constructor() { super(); this.stdout = new FakeStream(); this.stderr = new FakeStream(); this.killed = false; }
  kill() { this.killed = true; this.emit("exit", 0); }
}

test("starts with a fresh token and accepts only the structured ready line", async () => {
  const children = [], tokens = [];
  const supervisor = new SidecarSupervisor({
    command: "node", args: ["host-main.js"], randomToken: () => `token-${tokens.length + 1}`,
    spawn: (_file, _args, options) => { tokens.push(options.env.WEWORK_HOST_TOKEN); const child = new FakeChild(); children.push(child); queueMicrotask(() => child.stdout.emit("data", '{"type":"wework-host.ready","url":"http://127.0.0.1:4321"}\n')); return child; },
  });
  assert.deepEqual(await supervisor.start(), { url: "http://127.0.0.1:4321" });
  assert.deepEqual(tokens, ["token-1"]);
  assert.equal(supervisor.authorization(), "Bearer token-1");
  await supervisor.stop();
  assert.equal(children[0].killed, true);
});

test("restarts after a crash with a new token and stop suppresses further restart", async () => {
  const children = []; let token = 0;
  const supervisor = new SidecarSupervisor({
    command: "node", args: [], randomToken: () => `token-${++token}`, restartDelayMs: 0,
    spawn: () => { const child = new FakeChild(); children.push(child); queueMicrotask(() => child.stdout.emit("data", JSON.stringify({ type: "wework-host.ready", url: `http://127.0.0.1:${4300 + children.length}` }) + "\n")); return child; },
  });
  await supervisor.start();
  children[0].emit("exit", 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(children.length, 2);
  assert.equal(supervisor.authorization(), "Bearer token-2");
  await supervisor.stop();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(children.length, 2);
});

test("rejects startup when the sidecar exits before ready", async () => {
  const supervisor = new SidecarSupervisor({ command: "node", args: [], randomToken: () => "token", spawn: () => { const child = new FakeChild(); queueMicrotask(() => child.emit("exit", 98)); return child; } });
  await assert.rejects(supervisor.start(), /before ready.*98/);
  await supervisor.stop();
});

test("consumes and forwards sidecar stderr", async () => {
  let child; const messages = [];
  const supervisor = new SidecarSupervisor({
    command: "node", args: [], randomToken: () => "token",
    spawn: () => { child = new FakeChild(); queueMicrotask(() => child.stdout.emit("data", '{"type":"wework-host.ready","url":"http://127.0.0.1:4321"}\n')); return child; },
  });
  supervisor.on("stderr", (message) => messages.push(message));
  await supervisor.start();
  child.stderr.emit("data", "runtime failed\n");
  assert.deepEqual(messages, ["runtime failed\n"]);
  await supervisor.stop();
});
