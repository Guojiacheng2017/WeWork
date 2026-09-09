import {expect,test} from 'vitest';
import {employeeWorkStatus, employeeRingState, employeeErrorKey} from './employeeWorkStatus';
import type {WeWorkEmployee} from './wework';
const employee={id:'e',status:'idle'} as WeWorkEmployee;
test('idle has no activity, errors persist and working overrides old failed delivery',()=>{
 expect(employeeWorkStatus(employee).state).toBe('idle');
 expect(employeeWorkStatus({...employee,executionActivity:{state:'error',detail:'failed',updatedAt:'2026-09-08'}}).state).toBe('error');
 expect(employeeWorkStatus({...employee,executionActivity:{state:'working',detail:'tool',updatedAt:'2026-09-09'}}).state).toBe('working');
 expect(employeeWorkStatus({...employee,status:'blocked'}).state).toBe('waiting');
});

test('viewed errors keep diagnostic state but hide the ring; new errors reappear', () => {
 const failed = {...employee, executionActivity: {state: 'error' as const, detail:'failure', updatedAt:'2026-09-08T01:00:00Z'}};
 const read = {...failed, acknowledgedErrorKey:employeeErrorKey(failed)};
 expect(employeeRingState(read)).toBe('idle');
 expect(employeeWorkStatus(read).state).toBe('error');
 expect(employeeRingState({...read, executionActivity:{...failed.executionActivity, updatedAt:'2026-09-08T02:00:00Z'}})).toBe('error');
 for (const state of ['working','waiting'] as const) expect(employeeRingState({...read, executionActivity:{...failed.executionActivity,state}})).toBe(state);
});
