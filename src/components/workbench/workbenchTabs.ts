import type { MessageItem, WeWorkEmployee, WeWorkTeam } from '../../domain/wework';
import { employeeWorks, workbenchSession } from '../../domain/workbenchSessions';
export { employeeWorks };
export function workbenchTabs(employee: WeWorkEmployee, team: WeWorkTeam) {
  const works = employeeWorks(employee, team);
  return [
    {id:'private',title:'私聊',work:undefined},
    {id:'group',title:'群聊',work:undefined},
    ...works.map(work => ({id:work.id,title:work.title,work})),
    ...Object.entries(employee.workSessions ?? {}).filter(([id])=>!works.some(work=>work.id===id)).map(([id,session])=>({id,title:session.title ?? '历史工作',work:undefined})),
  ].map(tab=>({...tab,session:workbenchSession(employee,tab.id)}));
}
export function visibleGroupMessages(team: WeWorkTeam, employee: WeWorkEmployee): MessageItem[] {
  const messages=team.teamMessages ?? [];
  const tags=employee.activeSession.contextTagIds ?? [];
  const related=new Set((team.collaborationDeliveries ?? []).filter(delivery=>delivery.employeeId===employee.id).map(delivery=>delivery.messageId));
  for (const message of messages) if (message.senderId===employee.id || message.recipientId===employee.id) related.add(message.id);
  for (const id of [...related]) {
    let parent=messages.find(message=>message.id===id)?.replyToMessageId;
    const seen=new Set<string>();
    while(parent && !seen.has(parent)) {seen.add(parent);related.add(parent);parent=messages.find(message=>message.id===parent)?.replyToMessageId;}
  }
  return messages.filter(message=>employee.isLead || message.broadcast || message.contextTagIds?.some(tag=>tags.includes(tag)) || related.has(message.id));
}
export function tabMessages(team: WeWorkTeam, employee: WeWorkEmployee, tabId: string): MessageItem[] {
  const session=workbenchSession(employee,tabId);
  if(tabId!=='group') return session?.messages ?? [];
  const visible=visibleGroupMessages(team,employee);
  const progress=(session?.messages ?? []).filter(message=>!visible.some(group=>group.sourceRunId===message.runtimeRunId && group.text===message.text));
  return [...visible,...progress].sort((a,b)=>a.time.localeCompare(b.time));
}
