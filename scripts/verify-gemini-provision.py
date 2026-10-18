"""Exact-owner metadata/crypto readback only; never emits a provider/master key."""
import argparse,pathlib,sqlite3,json,re,datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
p=argparse.ArgumentParser();p.add_argument('--email',required=True);p.add_argument('--expected-id',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
files=[f for f in (root/'.local-state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if f.name!='metadata.sqlite']
if len(files)!=1:raise SystemExit('Expected one existing personal D1 database.')
with sqlite3.connect(f'file:{files[0].as_posix()}?mode=ro',uri=True) as db:
 row=db.execute('SELECT u.id,k.encrypted,k.updated_at FROM users u JOIN account_ai_keys k ON k.user_id=u.id WHERE u.email=? AND u.id=?',(a.email.strip().lower(),a.expected_id)).fetchone()
 if not row:raise SystemExit('Exact authorized owner has no encrypted AI key.')
master=re.search(r'^GEMINI_KEY_MASTER\s*=\s*[\'"]?([a-f0-9]{64})[\'"]?\s*$',(root/'.dev.vars').read_text(),re.M)
if not master:raise SystemExit('Server master missing or invalid.')
record=json.loads(row[1]);cipher=bytes.fromhex(record['ciphertext']);iv=bytes.fromhex(record['iv']);assert record['version']==1 and len(iv)==12
key=AESGCM(bytes.fromhex(master[1])).decrypt(iv,cipher,('neoform-gemini-v1:'+row[0]).encode()).decode('utf8')
assert re.fullmatch(r'[A-Za-z0-9_.-]{20,200}',key)
assert key not in row[1]
bound=False
try:AESGCM(bytes.fromhex(master[1])).decrypt(iv,cipher,b'neoform-gemini-v1:not-the-owner')
except Exception:bound=True
assert bound
proof={'checkedAt':datetime.datetime.now(datetime.UTC).isoformat(),'exactOwnerId':row[0],'configured':True,'cipherVersion':1,'ciphertextReadBack':True,'accountAADVerified':True,'keyFormatValid':True,'periodPreserved':'.' in key,'providerKeyEmitted':False,'personalProgramsReadOrWritten':False,'dpapiPendingDeleted':not(root/'.ai-runtime/pending-gemini-key.dpapi').exists()}
key=''
(root/'evidence/gemini').mkdir(parents=True,exist_ok=True)
(root/'evidence/gemini/provision-readback.json').write_text(json.dumps(proof,indent=2))
print(json.dumps(proof))
