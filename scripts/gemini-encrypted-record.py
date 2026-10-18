"""Read only the exact authorized account's encrypted AI record, never workouts."""
import argparse,pathlib,sqlite3,json
p=argparse.ArgumentParser();p.add_argument('--email',required=True);p.add_argument('--expected-id',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
files=[f for f in (root/'.local-state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if f.name!='metadata.sqlite']
if len(files)!=1:raise SystemExit('Expected one existing D1 database.')
with sqlite3.connect(f'file:{files[0].as_posix()}?mode=ro',uri=True) as db:
 row=db.execute('SELECT k.encrypted FROM account_ai_keys k JOIN users u ON u.id=k.user_id WHERE u.email=? AND u.id=?',(a.email.strip().lower(),a.expected_id)).fetchone()
 if not row:raise SystemExit('Exact authorized account has no encrypted key.')
 print(json.dumps({'account':a.expected_id,'encrypted':json.loads(row[0])}))
