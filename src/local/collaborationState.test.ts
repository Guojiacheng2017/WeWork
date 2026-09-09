import { expect, test } from 'vitest';
import { createLocalWeWorkApi, MemoryWeWorkStorage } from './localWeWorkApi';
async function setup() {
  const storage = new MemoryWeWorkStorage(), api = createLocalWeWorkApi(storage);
  const team = await api.createTeam({ name: 'Team', runtime: 'Workspace' });
  const target = await api.addEmployee(team.id, { displayName: 'Reviewer', roleName: 'Review', runtime: 'Workspace' });
  return { storage, api, team, target };
}
test('message and inbox persist atomically, retries deduplicate, conflicting payload rejects', async () => {
  const { storage, api, team, target } = await setup();
  const input = { text: 'Review this', recipientId: target.id, requestId: 'request-1' };
  const message = await api.postGroupMessage(team.id, input);
  expect((await api.postGroupMessage(team.id, input)).id).toBe(message.id);
  await expect(api.postGroupMessage(team.id, { ...input, text: 'different' })).rejects.toThrow('conflict');
  const restored = (await createLocalWeWorkApi(storage).snapshot()).teams[0];
  expect(restored.teamMessages).toHaveLength(1); expect(restored.collaborationDeliveries).toHaveLength(1);
  expect(restored.collaborationDeliveries![0].employeeId).toBe(target.id);
  await expect(api.postGroupMessage(team.id, { ...input, requestId: 'r2', recipientId: 'foreign' })).rejects.toThrow('recipient');
  expect((await api.postGroupMessage(team.id, { text: 'lead', requestId: 'lead' })).recipientId).toBe(team.employees[0].id);
});
test('public reply ancestry excludes private messages and final completion is idempotent', async () => {
  const { api, team } = await setup();
  await api.sendMessage(team.employees[0].id, 'PRIVATE-SECRET');
  const first = await api.postGroupMessage(team.id, { text: 'Plan B details', requestId: 'a' });
  const second = await api.postGroupMessage(team.id, { text: 'Use that plan', requestId: 'b', replyToMessageId: first.id });
  const context = await api.getGroupContext(team.id, second.deliveryId!);
  expect(JSON.stringify(context)).not.toContain('PRIVATE-SECRET');
  expect(context.conversation[0].id).toBe(first.id);
  await api.reserveGroupDelivery(team.id, first.deliveryId!, 'run');
  await api.finishGroupDelivery(team.id, first.deliveryId!, 'run', { status: 'succeeded', finalText: 'Public result' });
  await api.finishGroupDelivery(team.id, first.deliveryId!, 'run', { status: 'succeeded', finalText: 'Duplicate' });
  const snapshot = (await api.snapshot()).teams[0];
  expect(snapshot.teamMessages!.filter((m) => m.finalReply)).toHaveLength(1);
  expect(snapshot.employees[0].activeSession.messages).toHaveLength(1);
});

test('group context exposes only messages tagged for the recipient Session', async () => {
  const { api, team, target } = await setup();
  await (api.updateEmployee as any)(target.id, { displayName: target.displayName, roleName: target.roleName, runtime: target.runtime, skills: [], sessionContextTagIds: ['quality'] });
  const quality = await api.postGroupMessage(team.id, { text: 'Quality evidence', recipientId: target.id, requestId: 'quality', contextTagIds: ['quality'] } as any);
  const finance = await api.postGroupMessage(team.id, { text: 'FINANCE-SECRET', recipientId: target.id, requestId: 'finance', contextTagIds: ['finance'] } as any);
  await api.postGroupMessage(team.id, { text: 'UNTAGGED-NOISE', recipientId: target.id, requestId: 'noise' });
  const trigger = await api.postGroupMessage(team.id, { text: 'Please review', recipientId: target.id, requestId: 'trigger' });

  const context = await api.getGroupContext(team.id, trigger.deliveryId!);
  expect(context.conversation.map((message) => message.id)).toContain(quality.id);
  expect(JSON.stringify(context)).not.toContain('FINANCE-SECRET');
  expect(JSON.stringify(context)).not.toContain('UNTAGGED-NOISE');
  expect(context.manifest.contextTagIds).toEqual(['quality']);
  await expect((api.readGroupMessage as any)(team.id, finance.id, 0, trigger.deliveryId)).rejects.toThrow('not exposed');
});

test('group replies inherit the trigger context tags', async () => {
  const { api, team } = await setup();
  const trigger = await api.postGroupMessage(team.id, { text: 'Review', requestId: 'tagged', contextTagIds: ['quality', 'release'] } as any);
  await api.reserveGroupDelivery(team.id, trigger.deliveryId!, 'tag-run');
  const reply = await api.replyGroupMessage(team.id, { text: 'Done', requestId: 'tag-reply' }, { employeeId: team.employees[0].id, runId: 'tag-run', deliveryId: trigger.deliveryId });
  expect(reply.contextTagIds).toEqual(['quality', 'release']);
});
test('handoff preserves work records, queues behind target work, stale approval rejected', async () => {
  const { api, team, target } = await setup();
  const work = await api.createWork(team.id, { title: 'Report', goal: 'analyze', priority: 'low', category: 'Digital' });
  await api.assignWork(work.id, team.employees[0].id);
  const document = await api.saveWorkDocument(work.id, { title: 'Input', content: 'source', kind: 'input' });
  const occupied = await api.createWork(team.id, { title: 'Busy', goal: '', priority: 'low', category: 'Digital' });
  await api.assignWork(occupied.id, target.id);
  const request = await api.requestHandoff(work.id, { targetEmployeeId: target.id, note: 'review' });
  await api.decideHandoff(team.id, { handoffId: request.id, decision: 'accepted' });
  await api.decideHandoff(team.id, { handoffId: request.id, decision: 'accepted' });
  const saved = (await api.snapshot()).teams[0].employees.find((b) => b.id === target.id)!;
  expect(saved.queuedWorkItems).toHaveLength(1); expect(saved.queuedWorkItems![0].records!.documents[0].id).toBe(document.id);
  const stale = await api.requestHandoff(occupied.id, { targetEmployeeId: team.employees[0].id, note: 'move' });
  await api.returnCurrent(target.id);
  await expect(api.decideHandoff(team.id, { handoffId: stale.id, decision: 'accepted' })).rejects.toThrow('ownership changed');
});
test('cancelled work remains inspectable and cannot be reassigned or edited', async () => {
  const { api, team } = await setup();
  const work = await api.createWork(team.id, { title: 'Report', goal: '', priority: 'low', category: 'Digital' });
  await api.assignWork(work.id, team.employees[0].id);
  const document = await api.saveWorkDocument(work.id, { title: 'Input', content: 'source', kind: 'input' });
  await api.cancelWork(work.id); await api.cancelWork(work.id);
  expect((await api.getWorkRecords(work.id)).documents[0].id).toBe(document.id);
  expect((await api.snapshot()).teams[0].cancelledWorks).toHaveLength(1);
  await expect(api.assignWork(work.id, team.employees[0].id)).rejects.toThrow('cannot be assigned');
  await expect(api.reportProgress(work.id, { summary: 'late' })).rejects.toThrow('read-only');
});
test('uncertain execution cannot be retried or bypassed by a new queued message', async () => {
  const { api, team } = await setup();
  const message = await api.postGroupMessage(team.id, { text: 'Run', requestId: 'one' });
  await api.reserveGroupDelivery(team.id, message.deliveryId!, 'run');
  await api.finishGroupDelivery(team.id, message.deliveryId!, 'run', { status: 'uncertain' });
  await expect(api.retryGroupDelivery(team.id, { deliveryId: message.deliveryId!, requestId: 'retry' })).rejects.toThrow('only a failed');
  const next = await api.postGroupMessage(team.id, { text: 'Next', requestId: 'two' });
  await expect(api.reserveGroupDelivery(team.id, next.deliveryId!, 'run2')).rejects.toThrow('unresolved');
});

test('collaboration tool requests have a durable hop budget and idempotent tool IDs', async () => {
  const { api, team, target } = await setup();
  const root = await api.postGroupMessage(team.id, { text: 'Start', requestId: 'root' });
  await api.reserveGroupDelivery(team.id, root.deliveryId!, 'r0');
  const actor = { employeeId: team.employees[0].id, runId: 'r0', deliveryId: root.deliveryId };
  const child = await api.requestCollaboration(team.id, { text: 'Review', recipientId: target.id, requestId: 'tool-1' }, actor);
  expect((await api.requestCollaboration(team.id, { text: 'Review', recipientId: target.id, requestId: 'tool-1' }, actor)).id).toBe(child.id);
  await api.finishGroupDelivery(team.id, root.deliveryId!, 'r0', { status: 'succeeded' });
  await api.reserveGroupDelivery(team.id, child.deliveryId!, 'r1');
  const grandchild = await api.requestCollaboration(team.id, { text: 'Clarify', recipientId: team.employees[0].id, requestId: 'tool-2' }, { employeeId: target.id, runId: 'r1', deliveryId: child.deliveryId });
  await api.finishGroupDelivery(team.id, child.deliveryId!, 'r1', { status: 'succeeded' });
  await api.reserveGroupDelivery(team.id, grandchild.deliveryId!, 'r2');
  await expect(api.requestCollaboration(team.id, { text: 'Loop', recipientId: target.id, requestId: 'tool-3' }, { employeeId: team.employees[0].id, runId: 'r2', deliveryId: grandchild.deliveryId })).rejects.toThrow('budget');
});

test('queued cancellation is durable, idempotent and cannot conceal running or uncertain work', async () => {
  const { api, team, storage } = await setup();
  const message = await api.postGroupMessage(team.id, { text: 'Never start this', requestId: 'cancel' });
  await api.cancelGroupDelivery(team.id, message.deliveryId!);
  expect((await api.cancelGroupDelivery(team.id, message.deliveryId!)).status).toBe('cancelled');
  expect((await createLocalWeWorkApi(storage).snapshot()).teams[0].collaborationDeliveries![0].status).toBe('cancelled');
  await expect(api.reserveGroupDelivery(team.id, message.deliveryId!, 'run')).rejects.toThrow('reserved');
  const active = await api.postGroupMessage(team.id, { text: 'Active', requestId: 'active' });
  await api.reserveGroupDelivery(team.id, active.deliveryId!, 'active-run');
  await expect(api.cancelGroupDelivery(team.id, active.deliveryId!)).rejects.toThrow('Host stop');
});

test('an explicit group reply prevents a second automatic execution summary', async () => {
  const {api,team}=await setup();
  const trigger=await api.postGroupMessage(team.id,{text:'Reply once',requestId:'single-reply'});
  await api.reserveGroupDelivery(team.id,trigger.deliveryId!,'reply-run');
  await api.replyGroupMessage(team.id,{text:'Requested answer',requestId:'tool-reply'},{employeeId:team.employees[0].id,runId:'reply-run',deliveryId:trigger.deliveryId});
  await api.finishGroupDelivery(team.id,trigger.deliveryId!,'reply-run',{status:'succeeded',finalText:'Reply sent: Requested answer'});
  const saved=(await api.snapshot()).teams[0];
  expect(saved.teamMessages!.filter(message=>message.sourceRunId==='reply-run').map(message=>message.text)).toEqual(['Requested answer']);
  expect(saved.collaborationDeliveries![0].status).toBe('succeeded');
});

test('broadcasts enter each employee group context without private histories',async()=>{
 const {api,team,target}=await setup();
 const broadcast=await api.sendTeamMessage(team.id,'Shared announcement');
 await api.sendMessage(target.id,'PRIVATE');
 for(const employee of [team.employees[0],target]) {
   const trigger=await api.postGroupMessage(team.id,{text:'Discuss',requestId:employee.id,recipientId:employee.id});
   const context=await api.getGroupContext(team.id,trigger.deliveryId!);
   expect(context.conversation.map(m=>m.id)).toContain(broadcast.id);
   expect(JSON.stringify(context)).not.toContain('PRIVATE');
   expect((await api.readGroupMessage(team.id,broadcast.id,0,trigger.deliveryId)).text).toBe('Shared announcement');
 }
});
test('@all creates one shared message and one idempotent delivery per employee',async()=>{
 const {api,team,target}=await setup();
 const input={text:'@all reply',recipientId:'all',requestId:'all-request'};
 const message=await api.postGroupMessage(team.id,input);await api.postGroupMessage(team.id,input);
 const saved=(await api.snapshot()).teams[0];
 expect(saved.teamMessages).toHaveLength(1);expect(message.broadcast).toBe(true);
 expect(saved.collaborationDeliveries?.map(d=>d.employeeId)).toEqual([team.employees[0].id,target.id]);
 expect(saved.collaborationDeliveries?.every(d=>d.messageId===message.id)).toBe(true);
});
