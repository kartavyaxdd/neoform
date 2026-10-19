import {it,expect} from 'vitest';
import * as D from '../src/domain';
import { syntheticReadiness } from './readiness-fixture';
import {configureTechnique,pairTechnique} from '../src/techniques';
const now=Date.parse('2026-10-18T12:00:00Z');
const bench=D.catalog.find(x=>x.id==='bench')!;
function favorable(){
 return [3,1].map(days=>{
  const e=D.createEntry(bench);e.setup={label:'Synthetic rack',execution:'',availableLoads:[60,61.5]};e.sets.forEach(t=>Object.assign(t,{done:true,effortReported:true,weight:60,reps:12,rir:3}));
  const s=D.startSession('Synthetic review QA',[e]);s.startedAt=now-days*86400000;s.date=new Date(s.startedAt).toISOString().slice(0,10);
  s.muscleFeedback=[{muscle:'Chest',recovered:'yes',pain:false,soreness:1}];return s;
 });
}
const rec=(sessions:D.Session[],at=now,readiness:D.Readiness|null=syntheticReadiness(now))=>D.recommend('bench',sessions,D.catalog,{min:8,max:12},{now:at,readiness:readiness??undefined});
it('never treats a completed target default or legacy unknown effort as reported effort',()=>{
 const h=favorable();h.forEach(s=>s.exercises[0].sets.forEach(t=>t.effortReported=false));
 expect(rec(h).action).toBe('hold');expect(rec(h).reason).toMatch(/effort.*unconfirmed/i);
 h.forEach(s=>s.exercises[0].sets.forEach(t=>delete t.effortReported));
 expect(rec(h).action).toBe('hold');
});
it('does not use recovery-phase sessions as accumulation progression evidence',()=>{
 const h=favorable();h.forEach(s=>s.phase='maintenance');
 expect(D.recommend('bench',h,D.catalog,{min:8,max:12},{now,phase:'accumulation'}).action).toBe('hold');
});
it('requires two new exposures after a recovery phase and never adds volume from maintenance history',()=>{
 const h=favorable();h.forEach(s=>s.phase='accumulation');
 const recovery={...structuredClone(h[0]),id:D.uid(),date:'2026-10-16',phase:'deload' as const};
 expect(D.recommend('bench',[h[0],recovery,h[1]],D.catalog,{min:8,max:12},{now,phase:'accumulation'}).action).toBe('hold');
 h.forEach(s=>s.phase='maintenance');
 expect(D.muscleReview('Chest',h,D.catalog,{now,phase:'accumulation'}).action).toBe('hold');
});
it('holds when current effort, rest or load context differ from historical prescriptions',()=>{
 const h=favorable(); const entry=D.createEntry(bench);
 entry.target!.rest=60;
 expect(D.recommend('bench',h,D.catalog,entry.target!,{now,entry}).action).toBe('hold');
 entry.target!.rest=120;entry.target!.rir=1;
 expect(D.recommend('bench',h,D.catalog,entry.target!,{now,entry}).action).toBe('hold');
});
it('does not compare historical exposures with different intended effort',()=>{
 const h=favorable();h[0].exercises[0].target!.rir=3;
 expect(rec(h).action).toBe('hold');
 expect(D.muscleReview('Chest',h,D.catalog,{now}).action).toBe('hold');
});
it('does not infer proportional resistance from a machine label in deload',()=>{
 const p=D.starterProgram('balanced');p.currentWeek=p.deloadWeek;
 const machine=D.catalog.find(x=>x.id==='leg-press')!;
 const e=D.createEntry(machine);e.sets.forEach(s=>Object.assign(s,{done:true,weight:7}));
 const s=D.startSession('Machine label',[e]);s.phase='accumulation';
 const entries=D.prepareWorkout(p.workouts[2],p,D.catalog,[s]);
 expect(entries.find(e=>e.exerciseId==='leg-press')!.sets[0].weight).toBe(7);
});
it('rep progression preserves each row and adds only one total rep per exposure',()=>{
 const h=favorable();h.forEach(s=>s.exercises[0].sets.forEach((t,i)=>t.reps=[12,10,8][i]));
 expect(rec(h)).toMatchObject({action:'reps',setTargets:[{weight:60,reps:12},{weight:60,reps:10},{weight:60,reps:9}]});
});
it('preserves planned dose and does not progress equally incomplete exposures',()=>{
 const h=favorable().map(s=>D.completeSession({...s,exercises:s.exercises.map(e=>({...e,
   sets:e.sets.map((t,i)=>({...t,done:i===0}))}))}));
 expect(h[0].exercises[0].plannedWorkingSets).toBe(3);
 expect(h[0].exercises[0].sets).toHaveLength(1);
 expect(rec(h).action).toBe('hold');
 expect(rec(h).reason).toMatch(/dose|planned|incomplete/i);
});
it('selects the next workout from actual workout identity rather than number of sessions',()=>{
 const p=D.starterProgram('balanced');
 const s=D.startSession(p.workouts[1].name,[],p,p.workouts[1]);
 expect(s.workoutId).toBe(p.workouts[1].id);
 expect(D.nextWorkout(p,[s]).id).toBe(p.workouts[2].id);
 expect(D.nextWorkout(p,[s,{...s,id:D.uid(),startedAt:s.startedAt+1000}]).id).toBe(p.workouts[2].id);
});
it('unrelated unknown feedback cannot erase systemic fatigue; stale fatigue asks for confirmation, not indefinite recovery',()=>{
 const h=favorable();h[1].feedback={fatigue:5,reported:true};expect(rec(h,now,null).action).toBe('recover');
 const other=D.startSession('Unrelated unknown',[D.createEntry(D.catalog.find(x=>x.id==='squat')!)]);
 other.exercises[0].sets.forEach(t=>t.done=true);other.startedAt=now;other.date='2026-10-18';
 expect(rec([...h,other],now,null).action).toBe('recover');
 const stale=favorable();const old=D.startSession('Old systemic report',[]);old.date='2026-10-01';old.startedAt=Date.parse(old.date+'T12:00:00Z');old.feedback={fatigue:5,reported:true};
 expect(rec([old,...stale],now,null).action).toBe('hold');
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
 const h=favorable();h.forEach(s=>delete s.exercises[0].setup);const old=D.startSession('Legacy deload',[D.createEntry(bench,undefined,true)],p);
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
