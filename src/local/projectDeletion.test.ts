import { expect, test } from 'vitest';
import { createLocalWeWorkApi, MemoryWeWorkStorage } from './localWeWorkApi';
test('deleting one work item removes references and persists without removing its siblings',async()=>{
 const storage=new MemoryWeWorkStorage();const api=createLocalWeWorkApi(storage);const team=await api.createTeam({name:'Delete'});
 await api.configureTeamModules(team.id,{projectManagement:{installed:true,enabled:true,capabilities:['issues','board','gantt']}});
 const a=await api.createCollaborationWorkItem(team.id,{projectId:'project-main',title:'A'});const b=await api.createCollaborationWorkItem(team.id,{projectId:'project-main',title:'B'});
 const db=(await api.snapshot()).teams[0].collaborationDatabase!;
 db.relations.push({id:'r',sourceWorkItemId:a.id,targetWorkItemId:b.id,type:'blocks'});db.comments.push({id:'c',workItemId:a.id,authorId:'user',body:'hello',createdAt:new Date().toISOString()});await api.replaceCollaborationDatabase(team.id,db);
 await api.deleteCollaborationWorkItem(team.id,a.id);
 const saved=(await createLocalWeWorkApi(storage).snapshot()).teams[0].collaborationDatabase!;
 expect(saved.workItems.map(item=>item.id)).toEqual([b.id]);expect(saved.relations).toEqual([]);expect(saved.comments).toEqual([]);expect(saved.activities.some(activity=>activity.workItemId===a.id)).toBe(false);
 await expect(api.deleteCollaborationWorkItem(team.id,'missing')).rejects.toThrow();expect((await api.snapshot()).teams[0].collaborationDatabase!.workItems).toHaveLength(1);
});
