import {it,expect} from 'vitest';
import {emptyState,createEntry,catalog,startSession,completeSession} from '../src/domain';
import {editState} from '../src/stateEdit';
it('shares untouched history during logger edits and isolates deliberate nested mutations',()=>{
 const state=emptyState(),e=createEntry(catalog[0]);e.sets[0].done=true;
 state.sessions=[completeSession(startSession('Synthetic',[e]))];state.draft=startSession('Draft',[createEntry(catalog[0])]);
 const next=editState(state,s=>({...s,draft:{...s.draft!,notes:'changed'}}));
 expect(next.sessions).toBe(state.sessions);expect(next.sessions[0]).toBe(state.sessions[0]);expect(state.draft.notes).not.toBe('changed');
 const history=editState(next,s=>{s.sessions[0].notes='deliberate';return s;});
 expect(history.sessions[0]).not.toBe(next.sessions[0]);expect(next.sessions[0].notes).not.toBe('deliberate');
});
it('rejects invalid references and duplicate history without changing the old state',()=>{
 const state=emptyState(),e=createEntry(catalog[0]);e.sets[0].done=true;state.sessions=[completeSession(startSession('Synthetic',[e]))];
 expect(()=>editState(state,s=>({...s,sessions:[...s.sessions,...s.sessions]}))).toThrow();
 expect(()=>editState(state,s=>{s.sessions[0].exercises[0].exerciseId='unknown';return s;})).toThrow();
 expect(state.sessions[0].exercises[0].exerciseId).toBe(catalog[0].id);
});
