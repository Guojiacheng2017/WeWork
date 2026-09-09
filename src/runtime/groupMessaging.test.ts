import {expect,it} from 'vitest';
import {createLocalWeWorkApi} from '../local/localWeWorkApi';
import {publishGroupMessage} from './groupMessaging';

const createTeam = async () => {
  const memory=new Map<string,string>();
  const api=createLocalWeWorkApi({getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);}});
  const team=await api.createTeam({name:'Messaging test',runtime:'Workspace'});
  return {api,team};
};

it('browser-only messages persist publicly without creating deferred execution',async()=>{
  const {api,team:created}=await createTeam();
  await publishGroupMessage(api,false,created.id,'browser note');
  const team=(await api.snapshot()).teams[0];
  expect(team.teamMessages?.at(-1)?.text).toBe('browser note');
  expect(team.collaborationDeliveries??[]).toHaveLength(0);
});

it('desktop explicitly addressed messages create a durable delivery',async()=>{
  const {api,team}=await createTeam();
  await publishGroupMessage(api,true,team.id,'reply please',team.employees[0].id);
  expect((await api.snapshot()).teams[0].collaborationDeliveries).toHaveLength(1);
});

it('desktop broadcast messages are public without waking the team leader',async()=>{
 const {api,team}=await createTeam();await publishGroupMessage(api,true,team.id,'大家好 #进度');
 const saved=(await api.snapshot()).teams[0];expect(saved.collaborationDeliveries??[]).toHaveLength(0);expect(saved.teamMessages?.at(-1)?.broadcast).toBe(true);
});
