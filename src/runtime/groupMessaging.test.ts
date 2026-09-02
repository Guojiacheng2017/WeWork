import {expect,it} from 'vitest';
import {createLocalWeWorkApi} from '../local/localWeWorkApi';
import {initialTeams} from '../data/mockData';
import {publishGroupMessage} from './groupMessaging';

it('browser-only messages persist publicly without creating deferred execution',async()=>{
  const memory=new Map<string,string>();
  const api=createLocalWeWorkApi({getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);}});
  await api.bootstrap(structuredClone(initialTeams));
  await publishGroupMessage(api,false,initialTeams[0].id,'browser note');
  const team=(await api.snapshot()).teams[0];
  expect(team.teamMessages?.at(-1)?.text).toBe('browser note');
  expect(team.collaborationDeliveries??[]).toHaveLength(0);
});

it('desktop messages create durable delivery instead of only a public note',async()=>{
  const memory=new Map<string,string>();
  const api=createLocalWeWorkApi({getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);}});
  await api.bootstrap(structuredClone(initialTeams));
  await publishGroupMessage(api,true,initialTeams[0].id,'reply please');
  expect((await api.snapshot()).teams[0].collaborationDeliveries).toHaveLength(1);
});
