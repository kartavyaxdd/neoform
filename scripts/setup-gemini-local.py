"""Application schema-only local migration; never queries users/workouts."""
import argparse, pathlib, sqlite3, json
p=argparse.ArgumentParser();p.add_argument('--persist-to',required=True,choices=['.qa-state','.local-state']);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
files=[x for x in (root/a.persist_to/'v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if x.name!='metadata.sqlite']
if len(files)!=1:raise SystemExit('Require exactly one existing local D1 database; no database created.')
with sqlite3.connect(files[0],timeout=20) as db:
 db.executescript((root/'migrations/0002_gemini_account_keys.sql').read_text())
 names={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('account_ai_keys','ai_generation_lock')")}
 if names!={'account_ai_keys','ai_generation_lock'}:raise SystemExit('Schema verification failed.')
print(json.dumps({'schemaReady':True,'state':a.persist_to,'personalRowsRead':False}))
