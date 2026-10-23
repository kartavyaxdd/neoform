// One-time, operator-only provisioning. The new password arrives on stdin;
// existing credential values are never selected, printed or overwritten.
import { readFileSync } from 'node:fs';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cloudLaunchEnvironment } from './cloud-launch-policy.mjs';
const config = JSON.parse(readFileSync('.ci-production.json', 'utf8'));
if (config.name !== 'neoform-bca721354a' || config.account_id !== 'c2d9d6ac2167ca45cb832a894abce8c7' || config.d1_databases?.[0]?.database_id !== 'b8a5a783-5f9f-4f32-9264-db83591c6e37' || config.vars?.WORKSPACE_PROFILES !== 'enabled') throw Error('Exact profile-enabled installation required.');
const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (!password.length || password.length > 128 || /[\r\n]/.test(password)) throw Error('Provide one new profile password on stdin.');
const salt = randomBytes(16).toString('hex'), hash = pbkdf2Sync(password, salt, 100000, 32, 'sha512').toString('hex');
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'neoform-bca721354a-data', '--remote', '--config', '.ci-production.json', '--env-file', process.platform === 'win32' ? 'NUL' : '/dev/null', '--json', '--command', `UPDATE workspace_profiles SET pass_hash='${hash}',salt='${salt}' WHERE id='sharma' AND owner='public-workspace' AND locked=1 AND pass_hash IS NULL`], { encoding: 'utf8', windowsHide: true, env: cloudLaunchEnvironment(process.env) });
if (result.status !== 0) throw Error('Profile provisioning failed; raw credential-bearing output withheld.');
let rows;
try { rows = JSON.parse(result.stdout); } catch { throw Error('Unrecognized provisioning response; raw output withheld.'); }
if (!Array.isArray(rows) || !rows.some(r => r.meta?.changes === 1)) throw Error('Profile was not provisioned; an existing lock is never overwritten.');
console.log('New profile lock provisioned. Existing history and credential values were not read.');
