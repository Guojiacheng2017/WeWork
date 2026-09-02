import { expect, test } from 'vitest';
import { createLocalWeWorkApi, MemoryWeWorkStorage } from './localWeWorkApi';

async function setup() {
  const storage = new MemoryWeWorkStorage(), api = createLocalWeWorkApi(storage);
  const team = await api.createTeam({ name: 'Team', runtime: 'Workspace' });
  const work = await api.createWork(team.id, { title: 'Analysis', goal: 'Summarize inputs', acceptanceCriteria: 'Evidence required', priority: 'medium', category: 'Digital' });
  await api.assignWork(work.id, team.employees[0].id);
  return { storage, api, team, work };
}

test('documents retain exact revisions and context identifies omitted/truncated sources', async () => {
  const { api, work } = await setup();
  const original = await api.saveWorkDocument(work.id, { title: 'Input', kind: 'input', content: 'original' });
  const revised = await api.saveWorkDocument(work.id, { title: 'Input', kind: 'input', content: 'x'.repeat(10000), previousId: original.id });
  await expect(api.saveWorkDocument(work.id, { title: 'Input', kind: 'input', content: 'fork', previousId: original.id })).rejects.toThrow('revision conflict');
  expect((await api.readWorkDocument(work.id, original.id)).content).toBe('original');
  const page = await api.readWorkDocument(work.id, revised.id);
  expect(page.nextOffset).toBe(8000);
  expect((await api.readWorkDocument(work.id, revised.id, page.nextOffset!)).content.length).toBe(2000);
  for (let i = 0; i < 9; i++) await api.saveWorkDocument(work.id, { title: `Doc ${i}`, kind: 'input', content: 'x'.repeat(5000) });
  const context = await api.getWorkContext(work.id);
  expect(context.documents).toHaveLength(8);
  expect(context.documents.every((d) => d.truncated && d.excerpt.length === 1200)).toBe(true);
  expect(context.manifest.omittedDocumentIds).toContain(revised.id);
  expect(context.manifest.documentIds).not.toContain(original.id);
  expect(context.acceptanceCriteria).toBe('Evidence required');
});

test('delivery requires own output evidence, explicit review and rejects stale review', async () => {
  const { api, team, work, storage } = await setup();
  await expect(api.completeCurrent(team.employees[0].id)).rejects.toThrow('accepted deliverable');
  const input = await api.saveWorkDocument(work.id, { title: 'Source', content: 'source', kind: 'input' });
  await expect(api.submitDeliverable(work.id, { summary: 'done', documentIds: [input.id], evidence: 'tested' })).rejects.toThrow('output document');
  const output = await api.saveWorkDocument(work.id, { title: 'Report', content: 'result', kind: 'output' });
  const first = await api.submitDeliverable(work.id, { summary: 'draft', documentIds: [output.id], evidence: 'checked' });
  const second = await api.submitDeliverable(work.id, { summary: 'final', documentIds: [output.id], evidence: 'checked again' });
  await expect(api.reviewDeliverable(work.id, { deliverableId: first.id, decision: 'accepted', feedback: 'yes' })).rejects.toThrow('conflict');
  await api.reviewDeliverable(work.id, { deliverableId: second.id, decision: 'accepted', feedback: 'evidence reviewed' });
  await api.completeCurrent(team.employees[0].id);
  const restarted = createLocalWeWorkApi(storage);
  expect((await restarted.getWorkRecords(work.id)).deliverables).toHaveLength(2);
  expect((await restarted.snapshot()).teams[0].employees[0].completedWorkItems?.[0].id).toBe(work.id);
  await expect(api.reportProgress(work.id, { summary: 'late' })).rejects.toThrow('read-only');
});

test('agent actor cannot change inputs, cross-work references or another assignee', async () => {
  const { api, work, team } = await setup();
  const actor = { employeeId: team.employees[0].id, runId: 'run-1' };
  await expect(api.saveWorkDocument(work.id, { title: 'Override', content: 'new instruction', kind: 'decision' }, actor)).rejects.toThrow('only create output');
  await expect(api.reportProgress(work.id, { summary: 'spoof' }, { employeeId: 'other', runId: 'bad' })).rejects.toThrow('assignee');
  await api.reportProgress(work.id, { summary: 'working', blockers: 'none', nextStep: 'verify' }, actor);
  const output = await api.saveWorkDocument(work.id, { title: 'Output', content: 'result', kind: 'output' }, actor);
  const other = await api.createWork(team.id, { title: 'Other', goal: '', priority: 'low', category: 'Digital' });
  await expect(api.readWorkDocument(other.id, output.id)).rejects.toThrow('not found');
  const audit = (await api.getWorkRecords(work.id)).audit;
  expect(audit).toHaveLength(2);
  expect(audit.every((row) => row.actor?.runId === 'run-1')).toBe(true);
});

test('changed inputs invalidate acceptance and require a new delivery snapshot', async () => {
  const { api, work, team } = await setup();
  const input = await api.saveWorkDocument(work.id, { title: 'Input', kind: 'input', content: 'v1' });
  const output = await api.saveWorkDocument(work.id, { title: 'Output', kind: 'output', content: 'result' });
  const delivery = await api.submitDeliverable(work.id, { summary: 'done', documentIds: [output.id], evidence: 'checked v1' });
  expect(delivery.inputDocumentIds).toEqual([input.id]);
  await api.reviewDeliverable(work.id, { deliverableId: delivery.id, decision: 'accepted', feedback: 'approved' });
  await api.saveWorkDocument(work.id, { title: 'Input', kind: 'input', content: 'v2', previousId: input.id });
  await expect(api.completeCurrent(team.employees[0].id)).rejects.toThrow('accepted deliverable');
  expect((await api.snapshot()).teams[0].employees[0].currentWorkItem?.deliveryStatus).toBe('changes_requested');
});
