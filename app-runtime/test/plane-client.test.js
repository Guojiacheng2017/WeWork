import test from 'node:test'; import assert from 'node:assert/strict';
import { PlaneClient } from '../src/host/plane-client.js';

test('Plane client uses work-items API and normalizes a collaboration database', async () => {
  const calls=[]; const reply=(body)=>({ok:true,status:200,json:async()=>body,text:async()=>''});
  const client=new PlaneClient({baseUrl:'https://plane.example/',workspaceSlug:'acme',projectId:'p1',apiKey:'secret',fetch:async(url,init)=>{calls.push([url,init]); if(url.endsWith('/p1/'))return reply({id:'p1',name:'Core'}); if(url.includes('/work-items/'))return reply({results:[{id:'w1',name:'Ship',project:'p1',state:'s1',priority:'high',labels:[],assignees:[]}]}); if(url.endsWith('/states/'))return reply([{id:'s1',name:'Doing',group:'started',color:'#00f'}]); return reply([]);}});
  const db=await client.snapshot();
  assert.equal(db.workItems[0].title,'Ship'); assert.equal(db.workItems[0].priorityId,'priority-high');
  assert.ok(calls.some(([url])=>url.includes('/work-items/?per_page=100'))); assert.ok(calls.every(([,init])=>init.headers['X-API-Key']==='secret'));
});

test('Plane client maps WeWork patches back to Plane fields', async () => {
  let body; const client=new PlaneClient({baseUrl:'http://plane.local',workspaceSlug:'acme',projectId:'p1',apiKey:'secret',fetch:async(_url,init)=>{body=JSON.parse(init.body);return {ok:true,status:200,json:async()=>({}),text:async()=>''};}});
  await client.updateWorkItem('w1',{title:'Renamed',statusId:'state-2',priorityId:'priority-urgent',dueDate:'2026-09-30'});
  assert.deepEqual(body,{name:'Renamed',state:'state-2',priority:'urgent',target_date:'2026-09-30'});
});
