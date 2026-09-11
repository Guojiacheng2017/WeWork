import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({snapshot:vi.fn()}));
vi.mock('../api/weworkApi',()=>({weworkMode:'local',hostManagedWeWork:false,weworkApi:{snapshot:fixture.snapshot,listRuntimeProfiles:async()=>({profiles:[]})},localWeWorkApi:{}}));
vi.mock('../runtime/weworkHost',()=>({weworkHost:{},LoopbackRuntimeEvents:class{}}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubGlobal('window',{localStorage:{getItem:()=>null,setItem(){}}});});
afterEach(()=>vi.unstubAllGlobals());
it('does not let an older snapshot erase newly loaded team and tab state',async()=>{
 let resolveOld!:(value:unknown)=>void;
 fixture.snapshot.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve})).mockResolvedValueOnce({teams:[{id:'new-team',employees:[],topology:'roundTable'}],eventCursor:2});
 const {useWeWorkStore:store}=await import('./weworkStore');
 const old=store.getState().hydrate();await store.getState().hydrate();
 store.getState().selectWorkbenchTab('work-1');
 resolveOld({teams:[],eventCursor:1});await old;
 expect(store.getState().teams.map(team=>team.id)).toEqual(['new-team']);
 expect(store.getState().workbenchTabId).toBe('work-1');
});
