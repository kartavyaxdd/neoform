"""DPAPI -> account-AAD AES-GCM, entirely in memory; no plaintext output/files.
Run with uv run --no-project --with cryptography python scripts/provision-gemini.py ...
--encrypt-only emits ciphertext JSON to a private parent-process pipe, not a key.
"""
import argparse, base64, ctypes, ctypes.wintypes, json, os, pathlib, re, sqlite3, time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def project_root(): return pathlib.Path(__file__).resolve().parents[1]
def get_master():
 text=(project_root()/'.dev.vars').read_text(encoding='utf-8')
 m=re.search(r'^GEMINI_KEY_MASTER\s*=\s*[\'\"]?([a-f0-9]{64})[\'\"]?\s*$',text,re.M)
 if not m: raise RuntimeError('Persistent application encryption master missing.')
 return bytes.fromhex(m.group(1))
def decode_pending(file):
 root=project_root()/'.ai-runtime';file=pathlib.Path(file).resolve()
 if not file.is_relative_to(root):raise RuntimeError('DPAPI source must be inside project ignored runtime directory.')
 raw=base64.b64decode(file.read_text(encoding='utf-8-sig').strip(),validate=True)
 class BLOB(ctypes.Structure):_fields_=[('cbData',ctypes.wintypes.DWORD),('pbData',ctypes.POINTER(ctypes.c_ubyte))]
 source=(ctypes.c_ubyte*len(raw)).from_buffer_copy(raw);incoming=BLOB(len(raw),source);out=BLOB()
 crypt=ctypes.WinDLL('crypt32',use_last_error=True);kernel=ctypes.WinDLL('kernel32',use_last_error=True)
 crypt.CryptUnprotectData.argtypes=[ctypes.POINTER(BLOB),ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.wintypes.DWORD,ctypes.POINTER(BLOB)]
 crypt.CryptUnprotectData.restype=ctypes.wintypes.BOOL
 kernel.LocalFree.argtypes=[ctypes.c_void_p];kernel.LocalFree.restype=ctypes.c_void_p
 if not crypt.CryptUnprotectData(ctypes.byref(incoming),None,None,None,None,1,ctypes.byref(out)):raise RuntimeError('DPAPI decrypt failed for current Windows user; no login prompt attempted.')
 try:key=ctypes.string_at(out.pbData,out.cbData)
 finally:ctypes.memset(out.pbData,0,out.cbData);kernel.LocalFree(out.pbData)
 if not re.fullmatch(rb'[A-Za-z0-9_.-]{20,200}',key):raise RuntimeError('Literal Gemini key has unsupported header-safe format; not repaired.')
 return key

def main():
 p=argparse.ArgumentParser();p.add_argument('--email');p.add_argument('--expected-id');p.add_argument('--key-dpapi',required=True);p.add_argument('--persist-to',choices=['.local-state','.qa-state'],default='.local-state');p.add_argument('--encrypt-only',action='store_true');p.add_argument('--aad-account');a=p.parse_args()
 master=get_master();key=decode_pending(a.key_dpapi)
 if a.encrypt_only:
  if not a.aad_account:raise RuntimeError('Cipher-only mode requires explicit account AAD.')
  nonce=os.urandom(12);cipher=AESGCM(master).encrypt(nonce,key,('neoform-gemini-v1:'+a.aad_account).encode())
  print(json.dumps({'version':1,'iv':nonce.hex(),'ciphertext':cipher.hex()}));return
 if not a.email:raise RuntimeError('Existing account email is required; no account inferred or created.')
 email=a.email.strip().lower()
 if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise RuntimeError('Invalid account email.')
 files=[f for f in (project_root()/a.persist_to/'v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if f.name!='metadata.sqlite']
 if len(files)!=1:raise RuntimeError('Require one existing local D1 database; no DB created.')
 with sqlite3.connect(files[0],timeout=20) as db:
  db.execute('PRAGMA foreign_keys=ON')
  user=db.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()
  if not user:raise RuntimeError('Exact existing account not found; no new account created.')
  account=user[0]
  if a.expected_id and account!=a.expected_id:raise RuntimeError('Exact account identity guard mismatch.')
  nonce=os.urandom(12);aad=('neoform-gemini-v1:'+account).encode();cipher=AESGCM(master).encrypt(nonce,key,aad)
  value=json.dumps({'version':1,'iv':nonce.hex(),'ciphertext':cipher.hex()},separators=(',',':'))
  db.execute('INSERT INTO account_ai_keys(user_id,encrypted,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at',(account,value,int(time.time()*1000)))
  db.execute('UPDATE ai_generation_lock SET cancelled=1 WHERE user_id=?',(account,));db.commit()
  exact=db.execute('SELECT encrypted FROM account_ai_keys WHERE user_id=?',(account,)).fetchone()
  if not exact or exact[0]!=value:raise RuntimeError('Encrypted account write readback mismatch; pending blob retained.')
  record=json.loads(exact[0]);recovered=AESGCM(master).decrypt(bytes.fromhex(record['iv']),bytes.fromhex(record['ciphertext']),aad)
  if recovered!=key:raise RuntimeError('Cipher roundtrip mismatch; pending blob retained.')
  configured=bool(db.execute('SELECT EXISTS(SELECT 1 FROM account_ai_keys k JOIN users u ON u.id=k.user_id WHERE u.email=? AND u.id=?)',(email,account)).fetchone()[0])
  if not configured:raise RuntimeError('Exact-account configured readback failed; pending blob retained.')
 # Remove protected staging blob only after committed exact-target readback.
 pathlib.Path(a.key_dpapi).unlink()
 print(json.dumps({'configured':configured,'accountId':account,'email':email,'state':a.persist_to,'encryptedAtRest':True,'plaintextLogged':False,'pendingBlobDeleted':True}))

if __name__=='__main__':
 try:main()
 except Exception as e:
  # Do not print exception arguments from crypto/network code or plaintext buffers.
  print(json.dumps({'ok':False,'errorType':type(e).__name__,'message':'Gemini provisioning failed safely; key never printed.'}));raise SystemExit(1)
