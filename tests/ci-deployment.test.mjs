import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url);

const helper = '../scripts/ci-production-config.mjs';
const env = { NEOFORM_ACCOUNT_ID: 'c2d9d6ac2167ca45cb832a894abce8c7', NEOFORM_WORKER: 'neoform-bca721354a', NEOFORM_D1_ID: 'b8a5a783-5f9f-4f32-9264-db83591c6e37', GITHUB_SHA: 'a'.repeat(40) };
describe('production CI configuration', () => {
  it('generates only the exact existing installation with the safe cloud boundary', async () => {
    expect(existsSync(new URL(helper, import.meta.url))).toBe(true);
    const { ciProductionConfig } = await import(helper);
    const c = ciProductionConfig(env);
    expect(c.name).toBe(env.NEOFORM_WORKER);
    expect(c.account_id).toBe(env.NEOFORM_ACCOUNT_ID);
    expect(c.alias).toEqual({ './ai-local': './worker/ai-disabled.ts' });
    expect(c.secrets).toEqual({ required: ['GEMINI_KEY_MASTER'] });
    expect(c.d1_databases).toEqual([{ binding: 'DB', database_name: env.NEOFORM_WORKER + '-data', database_id: env.NEOFORM_D1_ID, migrations_dir: 'migrations' }]);
    expect(c.vars).toBeUndefined();
  });
  it('fails closed on every missing, malformed or different target', async () => {
    const { ciProductionConfig } = await import(helper);
    for (const key of ['NEOFORM_ACCOUNT_ID', 'NEOFORM_WORKER', 'NEOFORM_D1_ID']) {
      for (const value of [undefined, '', env[key] + '\n', '../evil', 'a'.repeat(32)]) {
        expect(() => ciProductionConfig({ ...env, [key]: value })).toThrow(key);
      }
    }
  });
  it('allows only the explicitly authorized public workspace opt-in, never a single-user bypass', async () => {
    const { ciProductionConfig } = await import(helper);
    expect(ciProductionConfig({ ...env, PUBLIC_WORKSPACE: 'enabled' }).vars).toEqual({ PUBLIC_WORKSPACE: 'enabled', WORKSPACE_PROFILES: 'enabled' });
    for (const value of ['true', 'disabled', 'enabled\n', ' enabled']) expect(() => ciProductionConfig({ ...env, PUBLIC_WORKSPACE: value })).toThrow('PUBLIC_WORKSPACE');
    expect(ciProductionConfig({ ...env, PUBLIC_WORKSPACE: '' }).vars).toBeUndefined();
  });
  it('requires a token before any remote call and confirms exact existing D1 and master metadata', async () => {
    const { checkExistingProduction } = await import(helper);
    const fetcher = vi.fn();
    await expect(checkExistingProduction(env, fetcher)).rejects.toThrow('CLOUDFLARE_API_TOKEN');
    expect(fetcher).not.toHaveBeenCalled();
    const good = { ...env, CLOUDFLARE_API_TOKEN: 'synthetic-token' };
    const reply = result => ({ ok: true, json: async () => ({ success: true, result }) });
    fetcher.mockResolvedValueOnce(reply({ uuid: env.NEOFORM_D1_ID, name: env.NEOFORM_WORKER + '-data' }))
      .mockResolvedValueOnce(reply([{ name: 'GEMINI_KEY_MASTER', type: 'secret_text' }]));
    await expect(checkExistingProduction(good, fetcher)).resolves.toBeUndefined();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `https://api.cloudflare.com/client/v4/accounts/${env.NEOFORM_ACCOUNT_ID}/d1/database/${env.NEOFORM_D1_ID}`,
      `https://api.cloudflare.com/client/v4/accounts/${env.NEOFORM_ACCOUNT_ID}/workers/scripts/${env.NEOFORM_WORKER}/secrets`,
    ]);
    for (const metadata of [[], [{ name: 'WRONG', type: 'secret_text' }]]) {
      fetcher.mockResolvedValueOnce(reply({ uuid: env.NEOFORM_D1_ID, name: env.NEOFORM_WORKER + '-data' })).mockResolvedValueOnce(reply(metadata));
      await expect(checkExistingProduction(good, fetcher)).rejects.toThrow();
    }
    fetcher.mockResolvedValueOnce(reply({ uuid: env.NEOFORM_D1_ID, name: 'different-data' }));
    await expect(checkExistingProduction(good, fetcher)).rejects.toThrow();
    fetcher.mockResolvedValueOnce({ ok: false });
    await expect(checkExistingProduction(good, fetcher)).rejects.toThrow('Cloudflare');
  });
  it('writes a nonsecret full-SHA marker and verifies the public response is the exact release', async () => {
    const { releaseMarker, verifyRelease } = await import(helper);
    expect(releaseMarker(env)).toEqual({ sha: env.GITHUB_SHA });
    for (const sha of ['', 'main', 'a'.repeat(39), 'A'.repeat(40), env.GITHUB_SHA + '\n']) {
      expect(() => releaseMarker({ ...env, GITHUB_SHA: sha })).toThrow();
    }
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: { subdomain: 'owner-public' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: env.GITHUB_SHA }) });
    await expect(verifyRelease({ ...env, CLOUDFLARE_API_TOKEN: 'synthetic-token' }, fetcher)).resolves.toBeUndefined();
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toContain(`https://${env.NEOFORM_WORKER}.owner-public.workers.dev/__release.json?sha=${env.GITHUB_SHA}`);
    expect(options.headers).not.toHaveProperty('Authorization');
    for (const response of [{ ok: false }, { ok: true, json: async () => ({ sha: 'b'.repeat(40) }) }]) {
      const bad = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: { subdomain: 'owner-public' } }) }).mockResolvedValue(response);
      await expect(verifyRelease({ ...env, CLOUDFLARE_API_TOKEN: 'synthetic-token' }, bad, 1)).rejects.toThrow();
    }
  });
  it('exercises CLI config/marker writes and rejects extra migrations, tracked local files and missing token', () => {
    const scratch = process.env.RUNNER_TEMP || process.env.TMPDIR || path.resolve('.qa-state/ci-tests');
    mkdirSync(scratch, { recursive: true });
    expect(scratch).toBeTruthy();
    const directory = mkdtempSync(path.join(scratch, 'neoform-ci-test-'));
    const cli = fileURLToPath(new URL(helper, import.meta.url));
    const childEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env, PUBLIC_WORKSPACE: 'enabled' };
    const invoke = command => spawnSync(process.execPath, [cli, command], { cwd: directory, env: childEnv, encoding: 'utf8' });
    try {
      expect(spawnSync('git', ['init', '--quiet'], { cwd: directory }).status).toBe(0);
      mkdirSync(path.join(directory, 'migrations'));
      for (const name of ['0001_private_accounts.sql', '0002_gemini_account_keys.sql', '0003_public_workspace.sql', '0004_normalized_history.sql', '0005_coaching_events.sql', '0006_workspace_profiles.sql', '0007_profile_ai_keys.sql']) writeFileSync(path.join(directory, 'migrations', name), '-- synthetic fixture only\n');
      mkdirSync(path.join(directory, 'dist'));
      expect(invoke('configure').status).toBe(0);
      expect(JSON.parse(readFileSync(path.join(directory, '.ci-production.json'), 'utf8')).vars).toEqual({ PUBLIC_WORKSPACE: 'enabled', WORKSPACE_PROFILES: 'enabled' });
      expect(invoke('configure').status).toBe(1); // Never overwrite an unexpected config.
      expect(invoke('marker').status).toBe(0);
      expect(JSON.parse(readFileSync(path.join(directory, 'dist/__release.json'), 'utf8'))).toEqual({ sha: env.GITHUB_SHA });
      expect(invoke('preflight').status).toBe(1); // No token, no network.
      rmSync(path.join(directory, '.ci-production.json'));
      writeFileSync(path.join(directory, 'migrations/0003_unreviewed.sql'), '-- synthetic fixture only\n');
      expect(invoke('configure').status).toBe(1);
      rmSync(path.join(directory, 'migrations/0003_unreviewed.sql'));
      writeFileSync(path.join(directory, '.dev.vars'), '# synthetic empty forbidden file\n');
      expect(spawnSync('git', ['add', '.dev.vars'], { cwd: directory }).status).toBe(0);
      expect(invoke('configure').status).toBe(1);
      expect(invoke('unknown').status).toBe(1);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('prepares the pinned official CLI in runner temp for no-auth synthetic transport tests on Ubuntu', () => {
    const text = readFileSync(workflowPath, 'utf8');
    for (const fragment of ['runs-on: ubuntu-latest', 'npm install --prefix "$RUNNER_TEMP/neoform-codex-test" --no-save --package-lock=false --no-audit --no-fund @openai/codex@0.160.0', 'chmod +x "$RUNNER_TEMP/neoform-codex-test/node_modules/@openai/codex/bin/codex.js"', 'CODEX_TEST_BINARY=$RUNNER_TEMP/neoform-codex-test/node_modules/@openai/codex/bin/codex.js', 'TMPDIR: ${{ runner.temp }}', 'run: npm test']) expect(text).toContain(fragment);
    const testScript = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.test;
    const coreCommand = text.match(/run: (npm test[^\r\n]*)/)?.[1];
    expect((testScript + ' ' + coreCommand).match(/--maxWorkers(?:=|\s)/g)).toHaveLength(1);
    expect(text.indexOf('@openai/codex@0.160.0')).toBeLessThan(text.indexOf('npm test'));
    expect(text).not.toMatch(/codex login|OPENAI_API_KEY|CODEX_API_KEY/);
  });
  it('uses runner context only after a runner exists, never in job-level env', () => {
    const text = readFileSync(workflowPath, 'utf8');
    const jobEnvironment = text.match(/\n    env:\n([\s\S]*?)\n    steps:/)?.[1];
    expect(jobEnvironment).toBeDefined();
    expect(jobEnvironment).not.toContain('runner.temp');
    expect(text).toMatch(/- name: Core tests\s+env:\s+TMPDIR: \$\{\{ runner\.temp \}\}\s+run: npm test/);
  });
  it('requires the real isolated Worker D1 and mobile gates before any remote write',()=>{
    const text=readFileSync(workflowPath,'utf8');
    const browser=text.indexOf('node node_modules/@playwright/test/cli.js install --with-deps chromium');
    const integration=text.indexOf('npm run test:integration');
    expect(browser).toBeGreaterThan(0);expect(integration).toBeGreaterThan(browser);
    expect(integration).toBeLessThan(text.indexOf('ci-production-config.mjs preflight'));
    expect(integration).toBeLessThan(text.indexOf('d1 migrations apply'));
  });
  it('serializes master-only production deployments with pinned actions, all gates and no credential provisioning', () => {
    expect(existsSync(workflowPath)).toBe(true);
    const text = readFileSync(workflowPath, 'utf8');
    for (const fragment of ['branches: [master]', 'workflow_dispatch:', 'contents: read', 'group: neoform-production', 'cancel-in-progress: false', "if: github.ref == 'refs/heads/master'", 'persist-credentials: false', 'npm ci', 'npm run typecheck', 'npm test', 'npm run build', 'npm run security:check', 'tests/cloud-launch-policy.test.mjs', 'tests/cloud-secret-policy.test.mjs', 'tests/public-workspace-worker.test.ts', 'tests/public-workspace-store.test.ts', 'tests/public-workspace-ui.test.ts', 'PUBLIC_WORKSPACE: ${{ vars.PUBLIC_WORKSPACE }}', 'tests/ci-deployment.test.mjs', 'node scripts/ci-production-config.mjs configure', 'node scripts/ci-production-config.mjs preflight', 'node scripts/ci-production-config.mjs marker', 'node scripts/ci-production-config.mjs verify', 'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}', 'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false"', 'NEOFORM_ACCOUNT_ID: ${{ vars.NEOFORM_ACCOUNT_ID }}', 'NEOFORM_WORKER: ${{ vars.NEOFORM_WORKER }}', 'NEOFORM_D1_ID: ${{ vars.NEOFORM_D1_ID }}', 'node_modules/.bin/wrangler d1 migrations apply neoform-bca721354a-data --remote --config .ci-production.json', 'node_modules/.bin/wrangler deploy --config .ci-production.json']) expect(text).toContain(fragment);
    expect(text).not.toMatch(/id-token:|contents: write|secrets: inherit|wrangler-action|d1 create|secret put|secret bulk|--provision|wrangler login|npx |\.dev\.vars|GEMINI_KEY_MASTER:/);
    const actions = [...text.matchAll(/uses: ([^\s]+)/g)].map(m => m[1]);
    expect(actions).toHaveLength(2);
    expect(actions.every(action => /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/.test(action))).toBe(true);
    expect(text.indexOf('preflight')).toBeLessThan(text.indexOf('d1 migrations apply'));
    expect(text.indexOf('npm run security:check')).toBeLessThan(text.indexOf('d1 migrations apply'));
    expect(text.indexOf('d1 migrations apply')).toBeLessThan(text.indexOf('wrangler deploy'));
    expect(text.indexOf('wrangler deploy')).toBeLessThan(text.indexOf('ci-production-config.mjs verify'));
  });
});
