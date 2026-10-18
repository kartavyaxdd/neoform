import {it,expect,vi} from 'vitest';
import {emptyState} from '../src/domain';
vi.mock('react',()=>({useSyncExternalStore:(_subscribe:unknown,get:()=>unknown)=>get()}));
it('expired authentication keeps the sign-in action stable until confirmed reauthentication',async()=>{
 vi.resetModules();vi.useFakeTimers();
 const items:Record<string,string>={};const storage=Object.defineProperties(items,{getItem:{value:(k:string)=>items[k]??null},setItem:{value:(k:string,v:string)=>items[k]=v},removeItem:{value:(k:string)=>delete items[k]}});
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('localStorage',storage);
 const user={id:'synthetic-reauth',email:'reauth@example.test'};
 const fetcher=vi.fn((url:string)=>Promise.resolve(Response.json(url==='/api/me'?user:{data:emptyState(),revision:1})));
 vi.stubGlobal('fetch',fetcher);
 try{
  const store=await import('../src/store');for(let i=0;i<40;i++)await Promise.resolve();
  store.change(s=>({...s,settings:{...s.settings,unit:'lb'}}));
  fetcher.mockImplementation(()=>Promise.resolve(Response.json({error:'Please sign in.'},{status:401})));
  await store.sync();expect(store.useStore().status).toBe('Sign in again to sync');const calls=fetcher.mock.calls.length;
  const retry=store.sync();expect(store.useStore().status).toBe('Sign in again to sync');await retry;expect(fetcher.mock.calls.length).toBe(calls);
  fetcher.mockImplementation(()=>Promise.resolve(Response.json({revision:2})));
  await store.initialize(user);expect(store.useStore().box.dirty).toBe(false);expect(store.useStore().status).toBe('Synced');
 }finally{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();}
});
