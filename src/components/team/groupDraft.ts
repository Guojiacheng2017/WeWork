export function parseGroupDraft(text:string, employees:{id:string;displayName:string}[]) {
 const mentioned=employees.filter(employee=>{
   const escaped=employee.displayName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   return new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[，。！？,!?])`,'u').test(text);
 });
 const tags=[...new Set([...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map(match=>match[1]))];
 const all=/(?:^|\s)@all(?=\s|$|[，。！？,!?])/iu.test(text);
 return {recipientId:all?'all':mentioned[0]?.id,mentioned,all,contextTagIds:tags};
}

export const groupMentionQuery = (text: string) => text.match(/(?:^|\s)@([^@\n]*)$/)?.[1];

export function groupMentionSuggestions(text: string, employees: { id: string; displayName: string }[]) {
  const query = groupMentionQuery(text);
  if (query === undefined) return [];
  return [{ id: 'all', displayName: 'all' }, ...employees].filter((employee) => employee.displayName.toLowerCase().includes(query.toLowerCase()));
}

export function completeGroupMention(text: string, displayName: string) {
  return groupMentionQuery(text) !== undefined
    ? text.replace(/@[^@\n]*$/, `@${displayName} `)
    : `${text}${text && !text.endsWith(' ') ? ' ' : ''}@${displayName} `;
}
