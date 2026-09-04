import readline from 'node:readline';

const ok = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
const fail = (id, error) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`);
const list = value => Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : [];
const config = value => {
  const url = new URL(String(value.baseUrl)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid Plane base URL');
  for (const key of ['workspaceSlug', 'projectId', 'apiKey']) if (!String(value[key] ?? '').trim()) throw new Error(`missing ${key}`);
  return { ...value, baseUrl: url.toString().replace(/\/$/, ''), workspaceSlug: encodeURIComponent(value.workspaceSlug), projectId: encodeURIComponent(value.projectId) };
};
const request = async (settings, suffix, init) => {
  const c=config(settings); const response=await fetch(`${c.baseUrl}/api/v1/workspaces/${c.workspaceSlug}/projects/${c.projectId}${suffix}`,{...init,headers:{'X-API-Key':c.apiKey,'Content-Type':'application/json'}});
  if(!response.ok) throw new Error(`Plane ${response.status}: ${(await response.text()).slice(0,240)}`); return response.status===204?null:response.json();
};
const snapshot = async settings => {
  const [project,workItems,states,labels]=await Promise.all([request(settings,'/'),request(settings,'/work-items/?per_page=100'),request(settings,'/states/'),request(settings,'/labels/')]); const now=new Date().toISOString();
  return {schemaVersion:1,projects:[{id:project.id,name:project.name,description:project.description??'',createdAt:project.created_at??now,updatedAt:project.updated_at??now}],workItems:list(workItems).map(item=>({id:item.id,projectId:item.project??project.id,title:item.name,description:item.description_stripped??'',statusId:typeof item.state==='object'?item.state.id:item.state,priorityId:`priority-${item.priority??'none'}`,labelIds:list(item.labels).map(x=>typeof x==='string'?x:x.id),assigneeIds:list(item.assignees).map(x=>typeof x==='string'?x:x.id),startDate:item.start_date??undefined,dueDate:item.target_date??undefined,createdAt:item.created_at??now,updatedAt:item.updated_at??now})),cycles:[],milestones:[],assignees:[],relations:[],comments:[],activities:[],statuses:list(states).map((state,position)=>({id:state.id,name:state.name,category:({backlog:'backlog',unstarted:'unstarted',started:'started',completed:'completed',cancelled:'cancelled'})[state.group]??'unstarted',color:state.color??'#94a3b8',position:state.sequence??position})),priorities:[['none',0,'#94a3b8'],['low',1,'#64748b'],['medium',2,'#f59e0b'],['high',3,'#ef4444'],['urgent',4,'#dc2626']].map(([name,level,color])=>({id:`priority-${name}`,name,level,color})),labels:list(labels).map(label=>({id:label.id,name:label.name,color:label.color??'#64748b'}))};
};
const tools = [
  {name:'project_test',description:'Test the configured Plane project connection.',_meta:{'wework/permissions':['network','credentials:integration','project:read']},inputSchema:{type:'object',required:['configuration'],properties:{configuration:{type:'object'}}}},
  {name:'project_sync',description:'Read a Plane project into the host collaboration model.',_meta:{'wework/permissions':['network','credentials:integration','project:read']},inputSchema:{type:'object',required:['configuration'],properties:{configuration:{type:'object'}}}},
  {name:'project_create_work_item',description:'Create a Plane work item and return a fresh project snapshot.',_meta:{'wework/permissions':['network','credentials:integration','project:write']},inputSchema:{type:'object',required:['configuration','title'],properties:{configuration:{type:'object'},title:{type:'string'}}}},
  {name:'project_update_work_item',description:'Update a Plane work item and return a fresh project snapshot.',_meta:{'wework/permissions':['network','credentials:integration','project:write']},inputSchema:{type:'object',required:['configuration','workItemId','patch'],properties:{configuration:{type:'object'},workItemId:{type:'string'},patch:{type:'object'}}}}
];
const call = async ({name,arguments:a}) => {
  if(name==='project_test'){await snapshot(a.configuration);return {ok:true};}
  if(name==='project_create_work_item') await request(a.configuration,'/work-items/',{method:'POST',body:JSON.stringify({name:a.title})});
  if(name==='project_update_work_item'){const p=a.patch,b={};if(p.title!==undefined)b.name=p.title;if(p.description!==undefined)b.description_html=p.description;if(p.statusId!==undefined)b.state=p.statusId;if(p.priorityId!==undefined)b.priority=String(p.priorityId).replace(/^priority-/,'');if(p.startDate!==undefined)b.start_date=p.startDate;if(p.dueDate!==undefined)b.target_date=p.dueDate;if(p.labelIds!==undefined)b.labels=p.labelIds;if(p.assigneeIds!==undefined)b.assignees=p.assigneeIds;await request(a.configuration,`/work-items/${encodeURIComponent(a.workItemId)}/`,{method:'PATCH',body:JSON.stringify(b)});}
  if(!['project_sync','project_create_work_item','project_update_work_item'].includes(name))throw new Error('unknown tool');
  return {database:await snapshot(a.configuration),syncedAt:new Date().toISOString()};
};
readline.createInterface({input:process.stdin}).on('line',async line=>{let msg;try{msg=JSON.parse(line);if(msg.method==='initialize')return ok(msg.id,{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'wework-plane',version:'0.1.0'}});if(msg.method==='notifications/initialized')return;if(msg.method==='tools/list')return ok(msg.id,{tools});if(msg.method==='tools/call'){const result=await call(msg.params);return ok(msg.id,{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});}throw new Error('method not found');}catch(error){if(msg?.id!==undefined)fail(msg.id,error);}});
