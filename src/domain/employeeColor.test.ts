import { expect, test } from 'vitest';
import { EMPLOYEE_COLORS, randomEmployeeColor } from './employeeColor';
import { createLocalWeWorkApi, MemoryWeWorkStorage } from '../local/localWeWorkApi';

test('new employees receive unused palette colors and saved changes persist without resetting sessions', async()=>{
 const storage=new MemoryWeWorkStorage();const api=createLocalWeWorkApi(storage);const team=await api.createTeam({name:'Color test'});
 const first=await api.addEmployee(team.id,{displayName:'One',roleName:'Dev',runtime:'Pi'});
 const second=await api.addEmployee(team.id,{displayName:'Two',roleName:'Dev',runtime:'Pi'});
 expect(first.color).not.toBe(second.color);expect(EMPLOYEE_COLORS).toContain(first.color);
 const input={displayName:first.displayName,roleName:first.roleName,runtime:first.runtime,skills:[],color:'#abcdef'};
 await api.updateEmployee(first.id,input);
 const stored=(await createLocalWeWorkApi(storage).snapshot()).teams[0].employees.find(e=>e.id===first.id)!;
 expect(stored.color).toBe('#ABCDEF');expect(stored.activeSession.id).toBe(first.activeSession.id);
 await expect(api.updateEmployee(first.id,{...input,color:'bad'})).rejects.toThrow();
 expect((await api.snapshot()).teams[0].employees.find(e=>e.id===first.id)!.color).toBe('#ABCDEF');
 expect(EMPLOYEE_COLORS).toContain(randomEmployeeColor(EMPLOYEE_COLORS));
});
