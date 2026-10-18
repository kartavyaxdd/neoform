import {it,expect,vi,afterEach} from 'vitest';
import {emptyState} from '../src/domain';
vi.mock('react',()=>({useSyncExternalStore:(_fn:unknown,read:()=>unknown)=>read()}));
const identity={id:'public-workspace',kind:'workspace',accessMode:'public-workspace'};
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
async function boot() {
 vi.resetModules();vi.useFakeTimers();
 const privateBox=JSON.stringify({data:{...emptyState(),profile:{name:'Private synthetic QA'}},revision:8,dirty:true,generation:2});
 const items:Record<string,string>={'neoform:signed-out':'1','neoform:identity':JSON.stringify({id:'private-qa',email:'private@example.test'}),'neoform:account:private-qa':privateBox,'neoform:pending:private-qa:old':privateBox};
 const storage=Object.defineProperties(items,{getItem:{value:(k:string)=>items[k]??null},setItem:{value:(k:string,v:string)=>{items[k]=v;}},removeItem:{value:(k:string)=>{delete items[k];}}});
 vi.stubGlobal('localStorage',storage);vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{onLine:true});
 const fetcher=vi.fn(async (url:string,init:RequestInit)=>url==='/api/me'?Response.json(identity):Response.json({revision:0,data:emptyState()}));vi.stubGlobal('fetch',fetcher);
 const store=await import('../src/store');for(let i=0;i<80;i++)await Promise.resolve();
 return {store,items,fetcher,privateBox};
}
it('opens explicit workspace without fabricating email despite legacy sign-out; private journals never become shared data',async()=>{
 const {store,items,fetcher,privateBox}=await boot();
 expect(store.useStore()).toMatchObject({user:identity,accessMode:'public-workspace',status:'Synced'});
 expect(store.useStore().box.data).toEqual(emptyState());
 expect(items['neoform:account:private-qa']).toBe(privateBox);expect(items['neoform:pending:private-qa:old']).toBe(privateBox);
 expect(fetcher.mock.calls.map(([url])=>url)).toEqual(['/api/me','/api/data']);
 expect(fetcher.mock.calls[1][1].headers).toMatchObject({'X-Neoform-Account':'public-workspace'});
});
it('cached public workspace reopens offline without private identity or sign-in UI',async()=>{
 const {store,fetcher}=await boot();fetcher.mockRejectedValue(new TypeError('Synthetic network outage'));
 await store.initialize();
 expect(store.useStore()).toMatchObject({user:identity,accessMode:'public-workspace',status:'Offline · saved on device'});
});
it('turning public mode off does not strand the browser in a workspace identity or prevent private login',async()=>{
 const {store,fetcher}=await boot();fetcher.mockImplementation(async()=>Response.json({error:'Please sign in.'},{status:401}));
 await store.initialize();expect(store.useStore().user).toBeNull();expect(store.useStore().accessMode).toBeUndefined();
 await expect(store.request('/login','POST',{})).rejects.toMatchObject({status:401});
});
it('public identity cannot log out or call private credential or AI requests programmatically',async()=>{
 const {store,fetcher}=await boot();fetcher.mockClear();
 await expect(store.logout()).rejects.toThrow(/public workspace/i);
 for(const path of ['/login','/register','/password','/account','/ai/key','/ai/generate'])await expect(store.request(path,'POST',{})).rejects.toThrow(/public workspace/i);
 expect(fetcher).not.toHaveBeenCalled();
});
