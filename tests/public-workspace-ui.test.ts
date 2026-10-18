import {it,expect,vi,afterEach} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {emptyState} from '../src/domain';
const snapshot=vi.hoisted(()=>({value:{} as any}));
vi.mock('../src/store',()=>({useStore:()=>snapshot.value,change:vi.fn(),saveChange:vi.fn(),request:vi.fn(),initialize:vi.fn(),login:vi.fn(),logout:vi.fn(),sync:vi.fn(),resolveConflict:vi.fn(),exportPendingCopies:vi.fn(()=>[]),clearLocal:vi.fn()}));
import App from '../src/App';
import {GeminiKeySettings} from '../src/GeminiKeySettings';
afterEach(()=>vi.unstubAllGlobals());
function setup(page:string,profile=true) {
 const data=emptyState();if(profile)data.profile={name:'Shared QA',experience:'New',goal:'Build muscle',equipment:['Dumbbell'],days:3};
 snapshot.value={user:{id:'public-workspace',kind:'workspace',accessMode:'public-workspace'},accessMode:'public-workspace',box:{data,dirty:false,revision:0},ready:true,status:'Synced',error:'',conflict:null};
 vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='neoform:page'?page:null});
}
it('public shell discloses shared read/write, cloud sync and no private auth controls',()=>{
 setup('train');const html=renderToStaticMarkup(createElement(App));
 expect(html).toContain('Public workspace: anyone with this URL can view/change data');
 expect(html).toContain('Cloud sync');expect(html).not.toContain('Private by default');expect(html).not.toContain('aria-label="Sign out"');
});
it('shared onboarding warns before entering any training data',()=>{
 setup('train',false);expect(renderToStaticMarkup(createElement(App))).toContain('Public workspace: anyone with this URL can view/change data');
});
it('public preferences hide account/password/key management and explain AI unavailable',()=>{
 setup('settings');const html=renderToStaticMarkup(createElement(App));
 for(const text of ['Change password','Delete account &amp; data','Save Gemini key','Only your authenticated account can read its data.','Built around your privacy.'])expect(html).not.toContain(text);
 expect(html).toContain('AI is unavailable in public mode');expect(html).toContain('Import from Hevy');
 expect(renderToStaticMarkup(createElement(GeminiKeySettings))).toBe('');
});
