export function taskInputSignature(work) {
  const documents = work.records?.documents ?? [];
  const superseded = new Set(documents.map((d) => d.previousId));
  return JSON.stringify([work.title, work.goal, work.constraints ?? '', work.acceptanceCriteria ?? '', documents.filter((d) => d.kind !== 'output' && !superseded.has(d.id)).map((d) => d.id)]);
}

const string = { type: 'string', minLength: 1 };
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const weworkToolDefinitions = [
  ['wework_get_dag', 'Read the team workflow DAG and version. An absent DAG has version 0.', schema()],
  ['wework_save_dag', 'Create or replace the active WeWork DAG. Assign nodes to people; their Skills remain person-owned. Configure only the upstream documents and summaries each downstream node needs. Read first and supply expectedVersion.', schema({ expectedVersion: { type: 'integer', minimum: 0 }, name: string, description: { type: 'string' }, nodes: { type: 'array', maxItems: 200, items: schema({ id: string, roleName: string, label: string, goal: { type: 'string' }, constraints: { type: 'string' }, acceptanceCriteria: { type: 'string' }, inputRequirements: { type: 'string' }, outputRequirements: { type: 'string' }, outputPersistence: { type: 'string', enum: ['handoff', 'database'] }, assignedEmployeeId: string, requires: { type: 'array', items: string }, inputBindings: { type: 'array', items: schema({ sourceNodeId: string, documentTitles: { type: 'array', items: string }, includeSummary: { type: 'boolean' } }, ['sourceNodeId']) }, position: schema({ x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y']) }, ['id', 'roleName','label']) } }, ['expectedVersion', 'name', 'nodes'])],
  ['wework_start_dag', 'Start the saved DAG as real work. Submitted upstream results release downstream work immediately; downstream can provide revision feedback when the result is insufficient.', schema()],
  ['wework_list_workflow_references', 'List reusable historical DAGs for one team-defined work type.', schema({ workTypeId: string }, ['workTypeId'])],
  ['wework_create_workflow', 'Create and select a temporary work DAG for a team-defined work type, optionally copying history and linking one concrete task. A task can have at most one DAG.', schema({ name: string, workTypeId: string, sourceWorkflowId: string, workId: string }, ['name', 'workTypeId'])],
  ['wework_configure_work_type', 'Team lead only: define a reusable work type, its work lead, participant scope and balanced/manual assignment policy.', schema({ id: string, name: string, leadEmployeeId: string, participantEmployeeIds: { type: 'array', items: string, minItems: 1 }, assignmentPolicy: { type: 'string', enum: ['balanced', 'manual'] }, assignmentWeights: { type: 'object', additionalProperties: { type: 'number' } } }, ['id', 'name', 'participantEmployeeIds', 'assignmentPolicy'])],
  ['wework_read_group_message', 'Read a public group message by ID, with pagination. Never reads private workbench history.', schema({ messageId: string, offset: { type: 'integer', minimum: 0 } }, ['messageId'])],
  ['wework_request_collaboration', 'Invite a teammate using their member ID. A workflow lead may use targetEmployeeId="work" for participants in the current work; only the team lead may use "all" for the entire team. Subject to a bounded collaboration budget.', schema({ targetEmployeeId: string, text: string }, ['targetEmployeeId', 'text'])],
  ['wework_send_upstream_feedback', 'Send durable revision feedback to the responsible employee of a direct upstream DAG node. This requests improvement without globally blocking downstream execution.', schema({ sourceNodeId: string, feedback: string }, ['sourceNodeId', 'feedback'])],
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
  ['board', 'wework_project_move_board_item', 'Update the status of a work item assigned to you. Team lead status does not bypass task ownership. Report blockers to the lead when task adjustments are needed.', schema({ workItemId: string, statusId: string }, ['workItemId', 'statusId'])],
  ['gantt', 'wework_project_schedule_gantt_item', 'Update shared work item dates from Gantt.', schema({ workItemId: string, startDate: string, dueDate: string }, ['workItemId', 'startDate', 'dueDate'])],
].map(([capability, name, description, parameters]) => ({ capability, name, description, parameters }));

const readOnlyTools = new Set(['wework_read_group_message', 'wework_get_team', 'wework_list_tasks', 'wework_get_task_context', 'wework_read_task_field', 'wework_read_document', 'wework_project_list_issues']);
const elevatedTools = new Set(['wework_request_handoff']);
readOnlyTools.add('wework_get_dag'); readOnlyTools.add('wework_list_workflow_references');
const workflowWrites = new Set(['wework_save_dag', 'wework_start_dag', 'wework_create_workflow']);
const teamWrites = new Set(['wework_configure_work_type', 'wework_project_create_issue', 'wework_project_schedule_gantt_item']);
const mutatingTools = new Set([
  ...teamWrites, ...workflowWrites, 'wework_project_move_board_item', 'wework_request_collaboration', 'wework_send_upstream_feedback', 'wework_send_team_message',
  'wework_request_handoff', 'wework_report_progress', 'wework_save_output', 'wework_submit_deliverable',
]);
function allowedByPermission(name, mode = 'auto') {
  if (name === 'wework_request_collaboration') return true;
  if (mode === 'full') return true;
  if (mode === 'ask') return readOnlyTools.has(name);
  return !elevatedTools.has(name);
}

export function createWeWorkTools(wework, spec, runSignal) {
  let observedInputs = spec.wework.inputSignature;
  const actor = { employeeId: spec.employeeId, runId: spec.id, deliveryId: spec.wework.deliveryId };
  const projectModule = spec.wework.modules?.projectManagement;
  const enabledProjectTools = projectModule?.installed && projectModule.enabled
    ? projectToolDefinitions.filter((definition) => projectModule.capabilities.includes(definition.capability)) : [];
  const definitions = [...weworkToolDefinitions, ...enabledProjectTools].filter(d =>
    (!teamWrites.has(d.name) || spec.wework.isLead === true) &&
    (!workflowWrites.has(d.name) || spec.wework.isLead === true || spec.wework.isWorkflowLead === true));
  return definitions.filter((d) => allowedByPermission(d.name, spec.wework.permissionMode) && (['wework_get_dag', 'wework_save_dag', 'wework_start_dag', 'wework_list_workflow_references', 'wework_create_workflow', 'wework_configure_work_type'].includes(d.name) || d.name.startsWith('wework_project_') || (spec.wework.group ? ['wework_get_team', 'wework_list_tasks', 'wework_send_team_message', 'wework_read_group_message', 'wework_request_collaboration'].includes(d.name) : !spec.wework.chat ? d.name !== 'wework_read_group_message' : d.name === 'wework_get_team'))).map((definition) => ({
    ...definition, label: definition.name, mutating: mutatingTools.has(definition.name),
    async execute(callId, input, signal) {
      if (signal?.aborted || runSignal?.aborted) throw new Error('WeWork run cancelled');
      const keys = Object.keys(input ?? {});
      if (!input || Array.isArray(input) || keys.some((key) => !(key in definition.parameters.properties)) || definition.parameters.required.some((key) => !(key in input))) throw new Error('invalid WeWork tool arguments');
      // Re-check assignment on every call; stale runs cannot mutate a reassigned task.
      const state = await wework.api.snapshot();
      const team = state.teams.find((t) => t.id === spec.wework.teamId);
      const employee = team?.employees.find((b) => b.id === spec.employeeId);
      if (teamWrites.has(definition.name) && employee?.isLead !== true) throw new Error('Team tool requires the current team lead');
      if (workflowWrites.has(definition.name) && employee?.isLead !== true && team.workflow?.leadEmployeeId !== employee?.id) throw new Error('Workflow tool requires the team lead or current work lead');
      if (!employee || (!spec.wework.chat && employee.currentWorkItem?.id !== spec.workId)) throw new Error('WeWork run no longer owns this work');
      if ((employee.activeSession?.permissionMode ?? 'auto') !== (spec.wework.permissionMode ?? 'auto')) throw new Error('Session permissions changed during execution; start a new run');
      if (!allowedByPermission(definition.name, employee.activeSession?.permissionMode ?? 'auto')) throw new Error('WeWork tool is not allowed by the current Session permission mode');
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
        case 'wework_get_dag': result = team.workflow ?? { version: 0, nodes: [] }; break;
        case 'wework_start_dag': result = await wework.api.startWorkflow(team.id); break;
        case 'wework_list_workflow_references': result = await wework.api.listWorkflowReferences(team.id, input.workTypeId); break;
        case 'wework_create_workflow': result = await wework.api.createWorkflow(team.id, { name: input.name, temporary: true, workTypeId: input.workTypeId, sourceWorkflowId: input.sourceWorkflowId, workId: input.workId }); break;
        case 'wework_configure_work_type': result = await wework.api.configureWorkType(team.id, input); break;
        case 'wework_save_dag': {
          if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== (team.workflow?.version ?? 0)) throw new Error('DAG version conflict; read the DAG again');
          if (typeof input.name !== 'string' || !input.name.trim() || (input.description !== undefined && typeof input.description !== 'string') || !Array.isArray(input.nodes) || input.nodes.length > 200) throw new Error('invalid DAG');
          const ids = new Set(input.nodes.map(n => n?.id));
          if (ids.size !== input.nodes.length) throw new Error('duplicate DAG node');
          for (const node of input.nodes) {
            if (!node || Object.keys(node).some(k => !['id','roleName','label','goal','constraints','acceptanceCriteria','inputRequirements','outputRequirements','outputPersistence','assignedEmployeeId','requires','inputBindings','position'].includes(k)) || ['id','roleName','label'].some(k => typeof node[k] !== 'string' || !node[k].trim()) || ['goal','constraints','acceptanceCriteria','inputRequirements','outputRequirements'].some(k => node[k] !== undefined && typeof node[k] !== 'string') || (node.outputPersistence !== undefined && !['handoff','database'].includes(node.outputPersistence)) || (node.position !== undefined && (!Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)))) throw new Error('invalid DAG node');
            if (node.assignedEmployeeId !== undefined && !team.employees.some(e => e.id === node.assignedEmployeeId)) throw new Error('DAG assignee is not a team member');
            if (node.requires !== undefined && (!Array.isArray(node.requires) || node.requires.some(id => !ids.has(id)))) throw new Error('unknown DAG dependency');
            if (node.inputBindings !== undefined && (!Array.isArray(node.inputBindings) || node.inputBindings.some(binding => !binding || !ids.has(binding.sourceNodeId) || (binding.documentTitles !== undefined && (!Array.isArray(binding.documentTitles) || binding.documentTitles.some(title => typeof title !== 'string'))) || (binding.includeSummary !== undefined && typeof binding.includeSummary !== 'boolean')))) throw new Error('invalid input bindings');
          }
          const visiting = new Set(), visited = new Set();
          const visit = id => {
            if (visiting.has(id)) throw new Error('DAG contains a cycle');
            if (visited.has(id)) return;
            visiting.add(id);
            for (const dependency of input.nodes.find(n => n.id === id).requires ?? []) visit(dependency);
            visiting.delete(id); visited.add(id);
          };
          for (const id of ids) visit(id);
          result = await wework.api.saveWorkflow(team.id, {
            id: team.workflow?.id ?? `workflow-${team.id}`, name: input.name, description: input.description ?? '',
            version: team.workflow?.version, temporary: team.workflow?.temporary, workType: team.workflow?.workType,
            workTypeId: team.workflow?.workTypeId, leadEmployeeId: team.workflow?.leadEmployeeId,
            participantEmployeeIds: team.workflow?.participantEmployeeIds, sourceWorkflowId: team.workflow?.sourceWorkflowId,
            contextTagId: team.workflow?.contextTagId, workId: team.workflow?.workId,
            nodes: input.nodes.map((node, index) => {
              const previous = team.workflow?.nodes.find(n => n.id === node.id);
              return { ...node, stepNumber: index + 1, status: previous?.status ?? 'ready',
                ...(previous?.workItemId ? { workItemId: previous.workItemId, inputDocumentIds: previous.inputDocumentIds ?? [], outputDocumentIds: previous.outputDocumentIds ?? [] } : {}),
                ...(node.position ?? previous?.position ? { position: node.position ?? previous.position } : {}) };
            }),
          });
          break;
        }
        case 'wework_read_group_message': result = await wework.api.readGroupMessage(team.id, input.messageId, input.offset, spec.wework.deliveryId); break;
        case 'wework_request_collaboration': {
          result = spec.wework.group
            ? await wework.api.requestCollaboration(team.id, { text: input.text, recipientId: input.targetEmployeeId, requestId: `tool:${spec.id}:${callId}`, replyToMessageId: team.collaborationDeliveries.find((d) => d.id === spec.wework.deliveryId).messageId }, actor)
            : await wework.api.requestWorkCollaboration(team.id, spec.workId, { text: input.text, recipientId: input.targetEmployeeId, requestId: `tool:${spec.id}:${callId}` }, actor);
          void wework.coordinator?.drain().catch(() => {}); break;
        }
        case 'wework_send_upstream_feedback': {
          const currentWork = employee.currentWorkItem;
          const workflow = team.workflows?.find((item) => item.id === currentWork.workflowId) ?? team.workflow;
          const currentNode = workflow?.nodes.find((node) => node.id === currentWork.workflowNodeId);
          const sourceNode = workflow?.nodes.find((node) => node.id === input.sourceNodeId);
          if (!workflow || !currentNode || !sourceNode || !(currentNode.requires ?? []).includes(sourceNode.id)) throw new Error('feedback target must be a direct upstream DAG node');
          if (!sourceNode.assignedEmployeeId || sourceNode.assignedEmployeeId === employee.id) throw new Error('upstream feedback recipient is unavailable');
          result = await wework.api.requestWorkCollaboration(team.id, spec.workId, { text: `【${currentNode.label} 对 ${sourceNode.label} 的修改反馈】\n${input.feedback}`, recipientId: sourceNode.assignedEmployeeId, requestId: `feedback:${spec.id}:${callId}` }, actor);
          void wework.coordinator?.drain().catch(() => {}); break;
        }
        case 'wework_get_team': result = { id: team.id, name: team.name, weworkSessionId: spec.wework.weworkSessionId, members: team.employees.map((b) => ({ id: b.id, name: b.displayName, role: b.roleName, isLead: b.isLead === true, skills: b.builtInSkills, currentTask: b.currentWorkItem ? { title: b.currentWorkItem.title, goal: b.currentWorkItem.goal } : null })) }; break;
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
        case 'wework_project_move_board_item': result = await wework.api.updateAssignedWorkItemStatus(team.id, input.workItemId, input.statusId, actor); break;
        case 'wework_project_schedule_gantt_item': result = await wework.api.updateCollaborationWorkItem(team.id, input.workItemId, { startDate: input.startDate, dueDate: input.dueDate }); break;
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  }));
}
