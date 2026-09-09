import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CheckpointStore } from "../src/host/checkpoint-store.js";
import { RuntimeManager } from "../src/host/runtime-manager.js";
import { EventJournal } from "../src/host/server.js";

async function waitForTerminal(manager, id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await manager.get(id);
    if (["succeeded", "failed", "cancelled"].includes(run?.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`run ${id} did not reach a terminal state`);
}

test("runtime persists terminal state and checkpoint for restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "wework-runtime-test-"));
  const store = new CheckpointStore(root), journal = new EventJournal();
  const manager = new RuntimeManager({ store, journal, execute: async (_spec, { emit }) => { emit({ type: "assistant.delta", text: "hi" }); return { messages: [{ role: "assistant", content: "done" }], finalText: "done", usage: {} }; } });
  await manager.start({ id: "run-1", employeeId: "employee-1", workId: "work-1", runtimeProfile: { adapter: "pi" }, session: { messages: [] } });
  assert.equal((await waitForTerminal(manager, "run-1")).status, "succeeded");
  assert.deepEqual((await store.getCheckpoint("employee-1")).messages, [{ role: "assistant", content: "done" }]);
  const restored = new RuntimeManager({ store, journal: new EventJournal(), execute: async () => assert.fail() });
  assert.equal((await restored.get("run-1")).status, "succeeded");
});

test("cancel aborts the active executor and ends cancelled", async () => {
  const root = await mkdtemp(join(tmpdir(), "wework-runtime-test-"));
  const manager = new RuntimeManager({ store: new CheckpointStore(root), journal: new EventJournal(), execute: async (_spec, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
  await manager.start({ id: "run-2", employeeId: "employee-1", workId: "work-2", runtimeProfile: { adapter: "pi" }, session: { messages: [] } });
  await manager.cancel("run-2");
  assert.equal((await waitForTerminal(manager, "run-2")).status, "cancelled");
});

test("runtime rejects missing Pi profile with a stable code", async () => {
  const root = await mkdtemp(join(tmpdir(), "wework-runtime-test-"));
  const manager = new RuntimeManager({ store: new CheckpointStore(root), journal: new EventJournal(), execute: async () => assert.fail() });
  await assert.rejects(() => manager.start({ id: "bad", employeeId: "employee", workId: "work" }), (error) => error.code === "RUNTIME_PROFILE_MISSING");
});

test("cancelAndWait waits for executor exit before releasing employee ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "wework-stop-test-"));
  let finish, started;
  const entered = new Promise(resolve => { started = resolve; });
  const manager = new RuntimeManager({ store: new CheckpointStore(root), journal: new EventJournal(), execute: async () => {
    started();
    return new Promise(resolve => { finish = resolve; });
  } });
  await manager.start({ id: "slow", employeeId: "employee", runtimeProfile: { id: "profile", adapter: "smalldash" } });
  await entered;
  let acknowledged = false;
  const stopping = manager.cancelAndWait("slow").then(run => { acknowledged = true; return run; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(acknowledged, false);
  await assert.rejects(manager.start({ id: "replacement", employeeId: "employee", runtimeProfile: { adapter: "smalldash" } }), { code: "RUN_ALREADY_ACTIVE" });
  finish({ finalText: "late output", messages: [] });
  assert.equal((await stopping).status, "cancelled");
  assert.equal(manager.active.has("slow"), false);
  assert.equal((await manager.get("slow")).status, "cancelled");
});

test("cancelAndWait timeout preserves active ownership until the executor stops", async () => {
  const root = await mkdtemp(join(tmpdir(), "wework-stop-test-"));
  let finish, started;
  const entered = new Promise(resolve => { started = resolve; });
  const manager = new RuntimeManager({ store: new CheckpointStore(root), journal: new EventJournal(), execute: async () => {
    started(); return new Promise(resolve => { finish = resolve; });
  } });
  await manager.start({ id: "hung", employeeId: "employee", runtimeProfile: { adapter: "smalldash" } });
  await entered;
  try {
    await assert.rejects(manager.cancelAndWait("hung", { timeoutMs: 10 }), { code: "RUN_CANCEL_TIMEOUT" });
    assert.equal(manager.active.has("hung"), true);
  } finally { finish({ finalText: "", messages: [] }); }
  await waitForTerminal(manager, "hung");
});

test("checkpoint from a different Harness or profile is not resumed", async () => {
  const root = await mkdtemp(join(tmpdir(), "wework-checkpoint-test-"));
  const store = new CheckpointStore(root);
  await store.putCheckpoint("shared-session", { employeeId: "employee", adapter: "pi", runtimeProfileId: "old", nativeSessionId: "private-old-session", messages: [{role:"user",content:"old data"}] });
  let received;
  const manager = new RuntimeManager({store, journal:new EventJournal(), execute:async spec => { received=spec; return {finalText:"new",nativeSessionId:"new-session",messages:[]}; }});
  await manager.start({id:"new-run",employeeId:"employee",runtimeProfile:{id:"new",adapter:"smalldash"},session:{id:"shared-session"}});
  await waitForTerminal(manager,"new-run");
  assert.equal(received.session.nativeSessionId, undefined);
  assert.equal(received.session.messages, undefined);
  const checkpoint = await store.getCheckpoint("shared-session");
  assert.equal(checkpoint.adapter,"smalldash");
  assert.equal(checkpoint.runtimeProfileId,"new");
});

test('resolved context limits trim a compatible portable checkpoint before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-context-limit-test-'));
  const store = new CheckpointStore(root);
  await store.putCheckpoint('limited-session', { employeeId: 'employee', adapter: 'pi', runtimeProfileId: 'profile', messages: [1, 2, 3, 4, 5].map((value) => ({ role: 'user', content: String(value) })) });
  let received;
  const manager = new RuntimeManager({ store, journal: new EventJournal(), execute: async (spec) => { received = spec; return { finalText: 'done', messages: [1, 2, 3, 4, 5, 6].map((value) => ({ role: 'assistant', content: String(value) })) }; } });

  await manager.start({ id: 'limited-run', employeeId: 'employee', runtimeProfile: { id: 'profile', adapter: 'pi' }, runtimeSettings: { context: { maxMessages: 3 } }, session: { id: 'limited-session' } });
  await waitForTerminal(manager, 'limited-run');

  assert.deepEqual(received.session.messages.map((message) => message.content), ['3', '4', '5']);
  assert.deepEqual((await store.getCheckpoint('limited-session')).messages.map((message) => message.content), ['4', '5', '6']);
});

test('steering reaches the active executor without starting a duplicate run',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wework-steer-'));const ready=Promise.withResolvers();const finish=Promise.withResolvers();const received=[];
 const manager=new RuntimeManager({store:new CheckpointStore(root),journal:new EventJournal(),execute:async(_spec,{registerControls})=>{registerControls({steer:async message=>received.push(message)});ready.resolve();await finish.promise;return {messages:[],finalText:'done'}}});
 await manager.start({id:'steer-run',employeeId:'employee',runtimeProfile:{adapter:'pi'},session:{}});await ready.promise;
 assert.deepEqual(await manager.steerEmployee('employee','Change direction'),{accepted:true,runId:'steer-run'});assert.deepEqual(received,['Change direction']);assert.equal(manager.active.size,1);
 finish.resolve();await waitForTerminal(manager,'steer-run');
 assert.deepEqual(await manager.steerEmployee('idle','hello'),{accepted:false});
});

test('private steering cannot enter an active public group run',async()=>{
 const manager=new RuntimeManager({});manager.active.set('group',{employeeId:'employee',group:true,adapter:'pi'});
 await assert.rejects(manager.steerEmployee('employee','private note'),error=>error.code==='GROUP_RUN_ACTIVE');
});
