import assert from "node:assert/strict";
import test from "node:test";
import { createHostServer, EventJournal } from "../src/host/server.js";

test("loopback host rejects requests without its bearer token", async () => {
  const host = createHostServer({ token: "secret", services: {} });
  await host.listen(0);
  try {
    const response = await fetch(`${host.url}/v1/health`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "HOST_UNAUTHORIZED");
  } finally { await host.close(); }
});

test("loopback host returns stable typed errors", async () => {
  const host = createHostServer({ token: "secret", services: {
    chooseDirectory: async () => { const error = new Error("not available"); error.code = "HOST_UNAVAILABLE"; throw error; },
  } });
  await host.listen(0);
  try {
    const response = await fetch(`${host.url}/v1/workspaces/local/choose`, { method: "POST", headers: { authorization: "Bearer secret" } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "HOST_UNAVAILABLE", message: "not available" } });
  } finally { await host.close(); }
});

test("data info exposes paths but no credentials or secrets", async () => {
  const info = { rootPath: "/Documents/WeWork", configPath: "/Documents/.wework", teamsPath: "/Documents/WeWork/teams", runtimePath: "/Documents/.wework/runtime", platform: "test" };
  const host = createHostServer({ token: "secret", services: { dataInfo: async () => info } });
  await host.listen(0);
  try {
    const response = await fetch(`${host.url}/v1/data/info`, { headers: { authorization: "Bearer secret" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), info);
  } finally { await host.close(); }
});

test("event journal replays events after a cursor", () => {
  const journal = new EventJournal(3);
  journal.publish({ type: "run.started", runId: "r1" });
  journal.publish({ type: "assistant.delta", runId: "r1", text: "one" });
  journal.publish({ type: "run.succeeded", runId: "r1" });
  assert.deepEqual(journal.after(1).map((event) => event.id), [2, 3]);
});

test('void WeWork mutations still return valid JSON across the desktop bridge', async () => {
  const host = createHostServer({token:'secret',services:{weworkCall:async()=>undefined}});
  await host.listen(0);
  try {
    const response = await fetch(`${host.url}/v1/wework/call`, {method:'POST',headers:{authorization:'Bearer secret','content-type':'application/json'},body:JSON.stringify({method:'acknowledgeEmployeeError',args:[]})});
    assert.equal(response.status,200);
    assert.equal(await response.json(),null);
  } finally {await host.close();}
});
