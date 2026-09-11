import type {WeWorkTeam} from '../../domain/wework';

export function groupTranscript(team: WeWorkTeam, employeeId: string | null) {
  const messages = team.teamMessages ?? [];
  if (!employeeId) return messages;
  const employee = team.employees.find(item => item.id === employeeId);
  const related = new Set((team.collaborationDeliveries ?? []).filter(item => item.employeeId === employeeId).map(item => item.messageId));
  const authored = (message: typeof messages[number]) => message.senderId === employeeId || (!message.senderId && message.sender === 'employee' && message.senderName === employee?.displayName);
  for (const message of messages) if (authored(message) && message.replyToMessageId) related.add(message.replyToMessageId);
  return messages.filter(message => authored(message) || message.recipientId === employeeId || related.has(message.id));
}
