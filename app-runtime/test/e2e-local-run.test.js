import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CheckpointStore } from "../src/host/checkpoint-store.js";
import { RuntimeManager } from "../src/host/runtime-manager.js";
import { createHostServer, EventJournal } from "../src/host/server.js";

async function waitForTerminal(request, id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await request(`/v1/runs/${id}`).then((response) => response.json());
    if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`run ${id} did not reach a terminal state`);
}

test("configuration to run, stream, completion and restart recovery closes locally", async () => {
  const root = await mkdtemp(join(tmpdir(), "wework-e2e-")), journal = new EventJournal(), store = new CheckpointStore(root);
  const runtime = new RuntimeManager({ store, journal, execute: async (_spec, { emit }) => { emit({ type: "assistant.delta", text: "hello" }); return { messages: [{ role: "assistant", content: "done" }], finalText: "done" }; } });
  const host = createHostServer({ token: "token", journal, services: { runtime } });
  await host.listen(0);
  const request = (path, init = {}) => fetch(`${host.url}${path}`, { ...init, headers: { authorization: "Bearer token", "content-type": "application/json", ...init.headers } });
  try {
    const response = await request("/v1/runs", { method: "POST", body: JSON.stringify({ id: "run-e2e", employeeId: "employee", workId: "work", runtimeProfile: { adapter: "pi" }, session: { messages: [] } }) });
    assert.equal(response.status, 202);
    assert.equal((await waitForTerminal(request, "run-e2e")).status, "succeeded");
    const events = await request("/v1/events", { headers: { "last-event-id": "1" } }).then((r) => r.json());
    assert.ok(events.events.some((event) => event.type === "assistant.delta"));
    const restored = new RuntimeManager({ store, journal: new EventJournal(), execute: async () => assert.fail() });
    assert.equal((await restored.get("run-e2e")).status, "succeeded");
  } finally { await host.close(); }
});
