import {it,expect} from 'vitest';
import * as D from '../src/domain';
import {exportHistoryBackup,importHistoryBackup} from '../src/historyBackup';
it('roundtrips a UTF-8 history beyond the old snapshot ceiling and rejects truncation or modification',async()=>{
 const state=D.emptyState();state.sessions=Array.from({length:600},(_,i)=>{const e=D.createEntry(D.catalog[0]);e.sets[0].done=true;e.notes='训练'.repeat(300);const s=D.completeSession(D.startSession(String(i),[e]));s.notes='é'.repeat(1900);return s;});
 const blob=await exportHistoryBackup(state);expect(blob.size).toBeGreaterThan(D.MAX_BACKUP);
 expect(await importHistoryBackup(blob)).toEqual(state);
 const text=await blob.text();await expect(importHistoryBackup(new Blob([text.slice(0,-100)]))).rejects.toThrow();
 await expect(importHistoryBackup(new Blob([text.replace('训练','changed')]))).rejects.toThrow();
 expect(await importHistoryBackup(new Blob([JSON.stringify({version:1,data:D.emptyState()})]))).toEqual(D.emptyState());
});
