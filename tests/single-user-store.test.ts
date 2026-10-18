import { it, expect, vi, afterEach } from 'vitest';
import { emptyState } from '../src/domain';
vi.mock('react', () => ({useSyncExternalStore: (_fn: unknown, read: () => unknown) => read()}));
const owner = {id: 'local-qa-account', email: 'qa@example.test', accessMode: 'single-user-local'};
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function boot(me: unknown = owner, status = 200, signedOut = true) {
 vi.resetModules(); vi.useFakeTimers();
 const items: Record<string,string> = signedOut ? {'neoform:signed-out': '1'} : {};
 const data = emptyState(); data.settings.unit = 'lb';
 const box = {data, revision: 2, dirty: true, generation: 1, base: {data: emptyState(), revision: 2}};
 items['neoform:account:'+owner.id] = JSON.stringify(box);
 items['neoform:pending:'+owner.id+':old-tab'] = JSON.stringify(box);
 const storage = Object.defineProperties(items, {
 getItem: {value: (k: string) => items[k] ?? null},
 setItem: {value: (k: string,v: string) => {items[k] = v;}},
 removeItem: {value: (k: string) => {delete items[k];}},
 });
 vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', new EventTarget());
 vi.stubGlobal('navigator', {onLine: true});
 const fetcher = vi.fn(async (url: string) => {
   if (url !== '/api/me') throw new TypeError('Synthetic offline sync');
   return Response.json(me, {status});
 }); vi.stubGlobal('fetch', fetcher);
 const store = await import('../src/store');
 for(let i=0;i<30;i++) await Promise.resolve();
 return {store, items, fetcher};
}
it('keeps ordinary explicit logout signed out even with an existing cookie identity', async () => {
 const {store, items, fetcher} = await boot({id: owner.id, email: owner.email});
 expect(store.useStore().user).toBeNull();
 expect(items['neoform:signed-out']).toBe('1');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('surfaces local configuration failure without dropping journals or inviting sign-in', async () => {
 const {store, items} = await boot({error: 'Configure SINGLE_USER_ID for this database.', accessMode: 'single-user-local'}, 503);
 expect(store.useStore()).toMatchObject({user: null, accessMode: 'single-user-local', status: 'Local setup required', error: 'Configure SINGLE_USER_ID for this database.'});
 expect(items['neoform:pending:'+owner.id+':old-tab']).toBeDefined();
});
it('local logout cannot clear owner caches even when called programmatically', async () => {
 const {store, items, fetcher} = await boot();
 const before = {...items}; fetcher.mockClear();
 await expect(store.logout()).rejects.toThrow(/single-user/i);
 expect(items).toEqual(before);
 expect(fetcher).not.toHaveBeenCalled();
});
it('discovers local mode despite old sign-out marker and preserves existing pending journal', async () => {
 const {store, items, fetcher} = await boot();
 expect(fetcher).toHaveBeenCalled();
 expect(store.useStore().user).toEqual(owner);
 expect(store.useStore().box.data.settings.unit).toBe('lb');
 expect(store.useStore().box.dirty).toBe(true);
 expect(items['neoform:signed-out']).toBeUndefined();
 expect(items['neoform:pending:'+owner.id+':old-tab']).toBeDefined();
});
