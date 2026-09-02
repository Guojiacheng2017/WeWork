export function taskInputSignature(work) {
  const documents = work.records?.documents ?? [];
  const superseded = new Set(documents.map((d) => d.previousId));
  return JSON.stringify([work.title, work.goal, work.constraints ?? '', work.acceptanceCriteria ?? '', documents.filter((d) => d.kind !== 'output' && !superseded.has(d.id)).map((d) => d.id)]);
}

const string = { type: 'string', minLength: 1 };
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const weworkToolDefinitions = [
  ['wework_read_group_message', 'Read a public group message by ID, with pagination. Never reads private workbench history.', schema({ messageId: string, offset: { type: 'integer', minimum: 0 } }, ['messageId'])],
  ['wework_request_collaboration', 'Request another group member to respond, within a bounded collaboration budget.', schema({ targetEmployeeId: string, text: string }, ['targetEmployeeId', 'text'])],
  ['wework_get_team', 'Read the current team roster without private employee sessions or credentials.', schema()],
  ['wework_send_team_message', 'Post a public team message as this employee. Does not dispatch other employees.', schema({ text: string }, ['text'])],
  ['wework_list_tasks', 'List team task titles, owners and status, without private histories.', schema()],
  ['wework_request_handoff', 'Create a durable handoff request for human approval. Does not transfer ownership.', schema({ targetEmployeeId: string, note: string }, ['targetEmployeeId', 'note'])],
  ['wework_get_task_context', 'Read the current task brief, progress, decisions and document manifest.', schema()],
  ['wework_read_task_field', 'Read omitted task goal, constraints or acceptance criteria in pages.', schema({ field: { type: 'string', enum: ['goal', 'constraints', 'acceptanceCriteria'] }, offset: { type: 'integer', minimum: 0 } }, ['field'])],
  ['wework_read_document', 'Read an exact revision of a document in the current task; follow nextOffset.', schema({ documentId: string, offset: { type: 'integer', minimum: 0 } }, ['documentId'])],
  ['wework_report_progress', 'Append a progress report. This does not complete the task.', schema({ summary: string, blockers: { type: 'string' }, nextStep: { type: 'string' } }, ['summary'])],
  ['wework_save_output', 'Save an immutable output document revision. Cannot change task inputs or decisions.', schema({ title: string, content: string, previousId: string }, ['title', 'content'])],
  ['wework_submit_deliverable', 'Submit output document IDs and verification evidence for human review. Does not approve the work.', schema({ summary: string, documentIds: { type: 'array', items: string, minItems: 1, maxItems: 20 }, evidence: string, knownIssues: { type: 'string' } }, ['summary', 'documentIds', 'evidence'])],
].map(([name, description, parameters]) => ({ name, description, parameters }));

const projectToolDefinitions = [
  ['issues', 'wework_project_list_issues', 'List work items from the enabled Issues capability.', schema()],
  ['issues', 'wework_project_create_issue', 'Create a work item in the shared Collaboration Database.', schema({ title: string, description: { type: 'string' }, priorityId: { type: 'string' }, startDate: { type: 'string' }, dueDate: { type: 'string' } }, ['title'])],
  ['board', 'wework_project_move_board_item', 'Move a shared work item to another Board status.', schema({ workItemId: string, statusId: string }, ['workItemId', 'statusId'])],
  ['gantt', 'wework_project_schedule_gantt_item', 'Update shared work item dates from Gantt.', schema({ workItemId: string, startDate: string, dueDate: string }, ['workItemId', 'startDate', 'dueDate'])],
].map(([capability, name, description, parameters]) => ({ capability, name, description, parameters }));

export function createWeWorkTools(wework, spec, runSignal) {
  let observedInputs = spec.wework.inputSignature;
  const actor = { employeeId: spec.employeeId, runId: spec.id, deliveryId: spec.wework.deliveryId };
  const projectModule = spec.wework.modules?.projectManagement;
  const enabledProjectTools = projectModule?.installed && projectModule.enabled
    ? projectToolDefinitions.filter((definition) => projectModule.capabilities.includes(definition.capability)) : [];
  return [...weworkToolDefinitions, ...enabledProjectTools].filter((d) => d.name.startsWith('wework_project_') || (spec.wework.group ? ['wework_get_team', 'wework_list_tasks', 'wework_send_team_message', 'wework_read_group_message', 'wework_request_collaboration'].includes(d.name) : !spec.wework.chat ? !['wework_read_group_message', 'wework_request_collaboration'].includes(d.name) : d.name === 'wework_get_team')).map((definition) => ({
    ...definition, label: definition.name,
    async execute(callId, input, signal) {
      if (signal?.aborted || runSignal?.aborted) throw new Error('WeWork run cancelled');
      const keys = Object.keys(input ?? {});
      if (!input || Array.isArray(input) || keys.some((key) => !(key in definition.parameters.properties)) || definition.parameters.required.some((key) => !(key in input))) throw new Error('invalid WeWork tool arguments');
      // Re-check assignment on every call; stale runs cannot mutate a reassigned task.
      const state = await wework.api.snapshot();
      const team = state.teams.find((t) => t.id === spec.wework.teamId);
      const employee = team?.employees.find((b) => b.id === spec.employeeId);
      if (!employee || (!spec.wework.chat && employee.currentWorkItem?.id !== spec.workId)) throw new Error('WeWork run no longer owns this work');
      if (definition.name.startsWith('wework_project_')) {
        const currentModule = team.modules?.projectManagement;
        if (!currentModule?.installed || !currentModule.enabled || !currentModule.capabilities.includes(definition.capability)) throw new Error('WeWork project capability is no longer enabled');
      }
      if (spec.wework.group) {
        const delivery = team.collaborationDeliveries?.find((d) => d.id === spec.wework.deliveryId);
        if (!delivery || delivery.runId !== spec.id || delivery.employeeId !== employee.id || delivery.status !== 'running') throw new Error('group delivery no longer active');
      }
      let result;
      switch (definition.name) {
        case 'wework_read_group_message': result = await wework.api.readGroupMessage(team.id, input.messageId, input.offset, spec.wework.deliveryId); break;
        case 'wework_request_collaboration': result = await wework.api.requestCollaboration(team.id, { text: input.text, recipientId: input.targetEmployeeId, requestId: `tool:${spec.id}:${callId}`, replyToMessageId: team.collaborationDeliveries.find((d) => d.id === spec.wework.deliveryId).messageId }, actor); void wework.coordinator?.drain().catch(() => {}); break;
        case 'wework_get_team': result = { id: team.id, name: team.name, weworkSessionId: spec.wework.weworkSessionId, members: team.employees.map((b) => ({ id: b.id, name: b.displayName, role: b.roleName })) }; break;
        case 'wework_list_tasks': result = [...team.pendingWorks, ...team.employees.flatMap((b) => [b.currentWorkItem, ...(b.queuedWorkItems ?? []), ...(b.completedWorkItems ?? [])].filter(Boolean))].map((w) => ({ id: w.id, title: w.title, assignedEmployeeId: w.assignedEmployeeId, status: w.status, deliveryStatus: w.deliveryStatus })); break;
        case 'wework_send_team_message': result = spec.wework.group ? await wework.api.replyGroupMessage(team.id, { text: input.text, requestId: `tool:${spec.id}:${callId}` }, actor) : await wework.api.sendTeamMessage(team.id, input.text, actor); break;
        case 'wework_request_handoff': {
          result = await wework.api.requestHandoff(spec.workId, input, actor);
          break;
        }
        case 'wework_get_task_context': result = await wework.api.getWorkContext(spec.workId); observedInputs = taskInputSignature(employee.currentWorkItem); break;
        case 'wework_read_task_field': result = await wework.api.readTaskField(spec.workId, input.field, input.offset); break;
        case 'wework_read_document': result = await wework.api.readWorkDocument(spec.workId, input.documentId, input.offset); break;
        case 'wework_report_progress': result = await wework.api.reportProgress(spec.workId, input, actor); break;
        case 'wework_save_output': {
          const document = await wework.api.saveWorkDocument(spec.workId, { ...input, kind: 'output' }, actor);
          const { content: _content, ...reference } = document; result = reference; break;
        }
        case 'wework_submit_deliverable':
          if (observedInputs !== taskInputSignature(employee.currentWorkItem)) throw new Error('Task inputs changed during execution. Read task context again and reconcile the output before submitting.');
          result = await wework.api.submitDeliverable(spec.workId, input, actor); break;
        case 'wework_project_list_issues': result = team.collaborationDatabase?.workItems ?? []; break;
        case 'wework_project_create_issue': result = await wework.api.createCollaborationWorkItem(team.id, { projectId: 'project-main', ...input }); break;
        case 'wework_project_move_board_item': result = await wework.api.updateCollaborationWorkItem(team.id, input.workItemId, { statusId: input.statusId }); break;
        case 'wework_project_schedule_gantt_item': result = await wework.api.updateCollaborationWorkItem(team.id, input.workItemId, { startDate: input.startDate, dueDate: input.dueDate }); break;
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  }));
}
