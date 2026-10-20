import { productionConfig, assertAiDeployment, assertRemoteDatabase } from './cloud-launch-policy.mjs';
import { hasMasterSecret } from './cloud-secret-policy.mjs';
import { writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Deliberately pinned: CI may update this installation, never create another one.
const installation = Object.freeze({
  NEOFORM_ACCOUNT_ID: 'c2d9d6ac2167ca45cb832a894abce8c7',
  NEOFORM_WORKER: 'neoform-bca721354a',
  NEOFORM_D1_ID: 'b8a5a783-5f9f-4f32-9264-db83591c6e37',
});
export function ciProductionConfig(env) {
  for (const [key, expected] of Object.entries(installation)) {
    if (env[key] !== expected) throw new Error(`Missing or unexpected ${key}; refusing production deployment.`);
  }
  const config = productionConfig({ compatibility_date: '2026-10-01' }, env.NEOFORM_ACCOUNT_ID, env.NEOFORM_WORKER.slice('neoform-'.length));
  config.d1_databases = [{ binding: 'DB', database_name: env.NEOFORM_WORKER + '-data', database_id: env.NEOFORM_D1_ID, migrations_dir: 'migrations' }];
  assertAiDeployment(config);
  // Existing shared guard validates the closed cloud baseline; this one explicit
  // public-workspace flag is independently allowlisted here, not arbitrary vars.
  if (env.PUBLIC_WORKSPACE !== undefined && env.PUBLIC_WORKSPACE !== '') {
    if (env.PUBLIC_WORKSPACE !== 'enabled') throw new Error('Invalid PUBLIC_WORKSPACE; only enabled is allowed.');
    config.vars = { PUBLIC_WORKSPACE: 'enabled' };
  }
  return config;
}

function requireToken(env) {
  if (typeof env.CLOUDFLARE_API_TOKEN !== 'string' || !env.CLOUDFLARE_API_TOKEN.trim())
    throw new Error('Missing CLOUDFLARE_API_TOKEN; OAuth fallback is forbidden.');
}
async function cloudflare(env, endpoint, fetcher) {
  requireToken(env);
  const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${env.NEOFORM_ACCOUNT_ID}/${endpoint}`, {
    method: 'GET', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Cloudflare metadata request failed; production is blocked.');
  const body = await response.json();
  if (body.success !== true) throw new Error('Cloudflare metadata rejected; production is blocked.');
  return body.result;
}
export async function checkExistingProduction(env, fetcher = fetch) {
  const config = ciProductionConfig(env);
  requireToken(env);
  const db = await cloudflare(env, `d1/database/${env.NEOFORM_D1_ID}`, fetcher);
  assertRemoteDatabase(config, [db]);
  const metadata = await cloudflare(env, `workers/scripts/${env.NEOFORM_WORKER}/secrets`, fetcher);
  if (!hasMasterSecret(metadata)) throw new Error('Existing GEMINI_KEY_MASTER required; CI will never create or rotate it.');
}
export function releaseMarker(env) {
  if (typeof env.GITHUB_SHA !== 'string' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA) || env.GITHUB_SHA.length !== 40)
    throw new Error('A full lowercase GITHUB_SHA is required.');
  return { sha: env.GITHUB_SHA };
}
export async function verifyRelease(env, fetcher = fetch, attempts = 12) {
  ciProductionConfig(env);
  const marker = releaseMarker(env);
  const account = await cloudflare(env, 'workers/subdomain', fetcher);
  if (typeof account?.subdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(account.subdomain))
    throw new Error('Cloudflare workers.dev subdomain missing or invalid.');
  const url = `https://${env.NEOFORM_WORKER}.${account.subdomain}.workers.dev/__release.json?sha=${marker.sha}`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      // The public asset request intentionally contains NO Cloudflare credentials.
      const response = await fetcher(url, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (response.ok && (await response.json()).sha === marker.sha) return;
    } catch { /* Propagation/HTML fallback is not successful verification. */ }
    if (attempt + 1 < attempts) await delay(5000);
  }
  throw new Error('Public release marker does not match GITHUB_SHA; deployment not verified.');
}

async function run(command, env) {
  const config = ciProductionConfig(env);
  if (command === 'configure') {
    // Inspect names only, never personal files or secret values.
    const tracked = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8', shell: false });
    if (tracked.status !== 0) throw new Error('Cannot validate checkout paths.');
    if (tracked.stdout.split('\0').some(name => /(^|\/)(\.dev\.vars(?:\..*)?|\.env(?:\..*)?|\.local-state|\.wrangler|ai-local\.ts)(\/|$)/.test(name)))
      throw new Error('Checkout contains forbidden local credential/state paths.');
    const migrations = (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort();
    if (JSON.stringify(migrations) !== JSON.stringify(['0001_private_accounts.sql', '0002_gemini_account_keys.sql', '0003_public_workspace.sql', '0004_normalized_history.sql']))
      throw new Error('Unexpected migrations: review and explicitly update the CI migration allowlist.');
    await writeFile('.ci-production.json', JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  } else if (command === 'preflight') await checkExistingProduction(env);
  else if (command === 'marker') await writeFile('dist/__release.json', JSON.stringify(releaseMarker(env)) + '\n');
  else if (command === 'verify') {
    await checkExistingProduction(env);
    await verifyRelease(env);
    console.log(`Verified public production release ${releaseMarker(env).sha}`);
  } else throw new Error('Expected configure, preflight, marker or verify.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Exactly one CI command required.');
    await run(process.argv[2], process.env);
  } catch {
    // Never serialize provider errors or environment values into CI output.
    console.error('Production CI failed closed. Check target variables, token permissions, remote metadata, migration allowlist and release marker; no credentials printed.');
    process.exitCode = 1;
  }
}
