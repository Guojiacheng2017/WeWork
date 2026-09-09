import {expect,it} from 'vitest';
import {completeGroupMention,groupMentionSuggestions,parseGroupDraft} from './groupDraft';
const employees=[{id:'a',displayName:'负责人'},{id:'b',displayName:'CV Worker'}];
it('extracts inline mention and deduplicated unicode hashtags',()=>{
 expect(parseGroupDraft('@CV Worker 看一下 #项目进度 #项目进度',employees)).toMatchObject({recipientId:'b',contextTagIds:['项目进度']});
});
it('does not mistake email or a partial employee name for a mention',()=>{
 expect(parseGroupDraft('mail@负责人.com @负责',employees).recipientId).toBeUndefined();
});
it('all is explicit fan-out and does not match email or longer words',()=>{
 expect(parseGroupDraft('@all 汇报 #进度',employees)).toMatchObject({all:true,recipientId:'all',contextTagIds:['进度']});
 expect(parseGroupDraft('@allison hello',employees).all).toBe(false);
 expect(parseGroupDraft('mail@all.com',employees).all).toBe(false);
});
it('provides the same filtered mention candidates for every group chat surface',()=>{
 expect(groupMentionSuggestions('@',employees)).toEqual([{id:'all',displayName:'all'},...employees]);
 expect(groupMentionSuggestions('请 @cv',employees)).toEqual([{id:'b',displayName:'CV Worker'}]);
 expect(groupMentionSuggestions('普通消息',employees)).toEqual([]);
});
it('completes an active mention without duplicating surrounding text',()=>{
 expect(completeGroupMention('请 @CV', 'CV Worker')).toBe('请 @CV Worker ');
 expect(completeGroupMention('请查看', '负责人')).toBe('请查看 @负责人 ');
});
