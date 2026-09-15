import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProductionAdmission} from '../src/host/production-admission.js';
test('chat cannot produce around a blocked DAG but can coordinate and read',async()=>{
 const node={workItemId:'w',assignedEmployeeId:'e',status:'waiting'};
 const service={api:{snapshot:async()=>({teams:[{id:'t',workflow:{nodes:[node]}}]})}};
 const spec={employeeId:'e',wework:{chat:true,teamId:'t'}};
 for(const name of ['bash','write','edit']) await assert.rejects(checkProductionAdmission(service,spec,name),/DAG/);
 for(const name of ['read','wework_send_team_message']) await checkProductionAdmission(service,spec,name);
 await checkProductionAdmission(service,{...spec,wework:{chat:false,teamId:'t'}},'bash');
 node.status='completed';await checkProductionAdmission(service,spec,'bash');
});
