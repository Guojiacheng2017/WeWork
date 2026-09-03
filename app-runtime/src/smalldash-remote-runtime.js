import { createHash } from 'node:crypto';
import { buildWorkPrompt } from './runtime.js';
import { loadEmployeeSkills } from './skill-loader.js';

export function buildRemoteSdhPersona(spec, skills) {
  return [...(spec.weworkPrompts ?? []).map((layer) => `[${layer.scope} WEWORK.md]\n${layer.content}`), spec.runtimeProfile.systemPrompt, `Employee: ${spec.employee.displayName}`, `Role: ${spec.employee.roleName}`, 'WeWork business skills are session instructions. SDH atomic skills remain owned and selected by smalldashharness.', ...skills.loaded.map((skill) => `Assigned WeWork skill ${skill.id}:\n${skill.content}`), skills.unloaded.length ? `WeWork skills not loaded: ${skills.unloaded.map((skill) => skill.name).join(', ')}` : ''].filter(Boolean).join('\n\n');
}

export async function executeRemoteSmalldashRun(spec, options = {}) {
  if (!options.sdh) throw Object.assign(new Error('Remote smalldashharness client is required'), { code: 'HARNESS_NOT_CONFIGURED' });
  if (options.tools?.length) options.emit?.({ type: 'assistant.activity', activity: 'status', text: '远程 SDH 尚未提供 WeWork 协作工具桥；本次仅发送业务上下文' });
  const nativeSessionId = spec.session?.nativeSessionId ?? `wework-${createHash('sha256').update(JSON.stringify([spec.employeeId, spec.session?.id])).digest('hex')}`;
  const skills = await loadEmployeeSkills(spec.employee.skills, { workspaceRoot: spec.workspace?.rootPath, skillRoots: spec.skillRoots ?? [], bundledRoots: options.bundledSkillRoots ?? [] });
  await options.sdh.request('/api/chat/init', { method: 'POST', body: JSON.stringify({ sessionId: nativeSessionId }) });
  const { baseUrl } = await options.sdh.connection.get();
  const streamAbort = new AbortController();
  const abort = () => { streamAbort.abort(); void options.sdh.request(`/api/cancel/${encodeURIComponent(nativeSessionId)}`, { method: 'POST' }).catch(() => {}); };
  options.signal?.addEventListener('abort', abort, { once: true });
  let finalText = '';
  try {
    const stream = await options.sdh.fetch(`${baseUrl}/api/sse/${encodeURIComponent(nativeSessionId)}`, { signal: streamAbort.signal });
    if (!stream.ok || !stream.body) throw new Error(`SDH event stream failed (${stream.status})`);
    const finished = consumeEvents(stream.body, (event, data) => {
      if (event === 'text') { finalText += data.content ?? ''; options.emit?.({ type: 'assistant.delta', text: data.content ?? '' }); }
      if (event === 'reasoning_cap') options.emit?.({ type: 'assistant.activity', activity: 'thinking', text: `上下文推理 ${data.chars ?? 0}/${data.max ?? 0}` });
      if (event === 'tool_call') options.emit?.({ type: 'assistant.activity', activity: 'tool', text: `SDH 调用 ${data.name ?? '工具'}` });
      if (event === 'tool_result') options.emit?.({ type: 'assistant.activity', activity: 'tool', text: `${data.name ?? '工具'} ${data.ok === false ? '失败' : '完成'}` });
    });
    const message = `${buildRemoteSdhPersona(spec, skills)}\n\n${buildWorkPrompt(spec)}`;
    await options.sdh.request(`/api/chat/${encodeURIComponent(nativeSessionId)}`, { method: 'POST', body: JSON.stringify({ message }), signal: options.signal });
    await finished;
    const history = await options.sdh.request(`/api/chat/${encodeURIComponent(nativeSessionId)}/history`);
    return { nativeSessionId, messages: history.messages ?? [], finalText };
  } finally { streamAbort.abort(); options.signal?.removeEventListener('abort', abort); }
}

async function consumeEvents(body, onEvent) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) throw new Error('SDH event stream ended before run completion');
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = block.match(/^event:\s*(.+)$/m)?.[1]; const raw = block.match(/^data:\s*(.+)$/m)?.[1];
      if (!event || !raw) continue;
      const data = JSON.parse(raw); onEvent(event, data);
      if (event === 'done') return;
      if (event === 'error') throw new Error(data.message ?? 'Remote SDH run failed');
    }
  }
}
