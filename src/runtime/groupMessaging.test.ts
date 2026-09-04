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

it('desktop messages create durable delivery instead of only a public note',async()=>{
  const {api,team}=await createTeam();
  await publishGroupMessage(api,true,team.id,'reply please');
  expect((await api.snapshot()).teams[0].collaborationDeliveries).toHaveLength(1);
});
