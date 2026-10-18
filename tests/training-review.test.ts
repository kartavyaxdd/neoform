import {it,expect} from 'vitest';
import * as D from '../src/domain';
import {configureTechnique,pairTechnique} from '../src/techniques';
const now=Date.parse('2026-10-18T12:00:00Z');
const bench=D.catalog.find(x=>x.id==='bench')!;
function favorable(){
 return [3,1].map(days=>{
  const e=D.createEntry(bench);e.sets.forEach(t=>Object.assign(t,{done:true,weight:60,reps:12,rir:3}));
  const s=D.startSession('Synthetic review QA',[e]);s.startedAt=now-days*86400000;s.date=new Date(s.startedAt).toISOString().slice(0,10);
  s.muscleFeedback=[{muscle:'Chest',recovered:'yes',pain:false,soreness:1}];return s;
 });
}
const rec=(sessions:D.Session[],at=now)=>D.recommend('bench',sessions,D.catalog,{min:8,max:12},{now:at});
it('unrelated unknown feedback cannot erase systemic fatigue; stale fatigue asks for confirmation, not indefinite recovery',()=>{
 const h=favorable();h[1].feedback={fatigue:5,reported:true};expect(rec(h).action).toBe('recover');
 const other=D.startSession('Unrelated unknown',[D.createEntry(D.catalog.find(x=>x.id==='squat')!)]);
 other.exercises[0].sets.forEach(t=>t.done=true);other.startedAt=now;other.date='2026-10-18';
 expect(rec([...h,other]).action).toBe('recover');
 const stale=favorable();const old=D.startSession('Old systemic report',[]);old.date='2026-10-01';old.startedAt=Date.parse(old.date+'T12:00:00Z');old.feedback={fatigue:5,reported:true};
 expect(rec([old,...stale]).action).toBe('hold');
 stale[1].feedback={fatigue:2,reported:true};expect(rec([old,...stale]).action).toBe('load');
 expect(rec(h,now+40*86400000).action).toBe('hold');
});
it('missing historical prescriptions remain valid records but cannot justify positive progression',()=>{
 const h=favorable();h.forEach(s=>delete s.exercises[0].target);
 expect(D.sessionSchema.safeParse(h[0]).success).toBe(true);
 expect(rec(h).action).toBe('hold');expect(rec(h).reason).toMatch(/prescri|unknown/i);
});
it('legacy scheduled and ambiguous 4-RIR deloads never compound reference reductions and new sessions retain phase provenance',()=>{
 const p=D.starterProgram('minimal');p.currentWeek=p.deloadWeek;
 p.workouts.forEach(w=>w.exercises=[D.target('bench')]);
 const h=favorable();const old=D.startSession('Legacy deload',[D.createEntry(bench,undefined,true)],p);
 // Simulate pre-upgrade records which had week metadata but no phase snapshot.
 delete (old as D.Session & {phase?:string}).phase;
 old.date='2026-10-18';old.startedAt=now;old.exercises[0].sets.forEach(t=>Object.assign(t,{done:true,weight:30}));
 const prepared=()=>D.prepareWorkout(p.workouts[1],p,D.catalog,[...h,old]);
 expect(prepared()[0].sets[0].weight).toBe(30);
 delete old.programId;delete old.week;expect(prepared()[0].sets[0].weight).toBe(30);
 expect(D.prepareWorkout(p.workouts[1],p,D.catalog,[old])[0].sets[0].weight).toBe(0);
 const fresh=D.startSession('New deload',prepared(),p);
 expect(fresh).toMatchObject({phase:'deload'});
 expect(D.sessionSchema.parse(fresh)).toEqual(fresh);
});
it('record contexts use semantic protocols rather than random group instances and expose method and bout labels',()=>{
 const sequences=[0,1].map(i=>{
  const e=configureTechnique(D.createEntry(bench),'myoreps');e.sets[0].done=true;e.sets[0].weight=60;e.sets.push({...e.sets[0],id:D.uid(),bout:'mini',reps:5,rest:20});
  const s=D.startSession('Sequence '+i,[e]);return s;
 });
 expect(sequences[0].exercises[0].techniqueGroup).not.toBe(sequences[1].exercises[0].techniqueGroup);
 const records=D.records(sequences,D.catalog);expect(records).toHaveLength(2);
 expect(records.every(r=>(r as typeof r & {context:string}).context.includes('myoreps'))).toBe(true);
 const pair=(partner='row')=>{const s=D.startSession('Pair',[D.createEntry(bench),D.createEntry(D.catalog.find(x=>x.id===partner)!)]);return pairTechnique(s,s.exercises[0].id,s.exercises[1].id,'superset',D.catalog)};
 const a=pair(),b=pair(),c=pair('pulldown');
 expect(D.comparableKey(a.exercises[0],bench)).toBe(D.comparableKey(b.exercises[0],bench));
 expect(D.comparableKey(a.exercises[0],bench)).not.toBe(D.comparableKey(c.exercises[0],bench));
 expect(D.sessionSchema.parse(a)).toEqual(a);
});
it('visualization data separates advanced bouts and preserves raw set method/phase and matching weight-rep pairs',()=>{
 const plain=favorable()[0];plain.exercises[0].sets[0].weight=65;plain.exercises[0].sets[0].reps=8;
 const advanced=D.startSession('Advanced',[configureTechnique(D.createEntry(bench),'myoreps')]);
 advanced.exercises[0].sets[0].done=true;advanced.exercises[0].sets[0].weight=20;
 expect(typeof (D as any).directVolume).toBe('function');
 expect((D as any).directVolume([plain,advanced],D.catalog).Chest).toBe(3);
 expect(typeof (D as any).performanceTimeline).toBe('function');
 const points=(D as any).performanceTimeline('bench',[plain,advanced],D.catalog);
 expect(points.find((p:any)=>p.weight===65)).toMatchObject({reps:8});
 expect(points.some((p:any)=>p.context.includes('myoreps'))).toBe(true);
 expect(points.every((p:any)=>typeof p.context==='string')).toBe(true);
});
