# GitHub production deployment

## One-time owner setup

The workflow deploys **only** the existing `neoform-bca721354a` Worker and its existing `neoform-bca721354a-data` D1 database. It never creates a database, provisions a master secret, logs in with OAuth, or imports credentials from a developer PC.

In the private repository **Settings → Secrets and variables → Actions**, set these **repository variables** exactly (no spaces/newlines):

| Variable | Value |
| --- | --- |
| `NEOFORM_ACCOUNT_ID` | `c2d9d6ac2167ca45cb832a894abce8c7` |
| `NEOFORM_WORKER` | `neoform-bca721354a` |
| `NEOFORM_D1_ID` | `b8a5a783-5f9f-4f32-9264-db83591c6e37` |
| `PUBLIC_WORKSPACE` | Optional: `enabled` only when the owner explicitly chooses public read/write without login. Unset/empty omits the flag; every other value fails. |

Set the **repository secret** `CLOUDFLARE_API_TOKEN` to an owner-created Cloudflare API token scoped to this account, with **Workers Scripts: Edit** and **D1: Edit** permissions. It must support reading the account workers.dev subdomain, Worker secret-name metadata, and exact D1 database metadata, plus deploying Worker/assets and applying migrations. Do not copy Wrangler OAuth state or the PC's credential files. Do not paste tokens into commands, source, chat or documentation.

`GEMINI_KEY_MASTER` must already exist remotely on this Worker. **Do not add its value to GitHub. Do not recreate, rotate, upload or delete it in CI.** Existing encrypted account keys depend on the original master. The workflow reads secret names/types only before deployment and again after deployment. Missing/unexpected secrets block production. Wrangler's `secrets.required` also declares this dependency. No `--secrets-file` or secret-management command is used.

The public-workspace flag is not `SINGLE_USER_MODE` or another local bypass: its runtime behavior belongs to the separately tested explicit public-workspace implementation. Enabling it intentionally makes the shared workspace readable/writable by anyone with the URL. This CI helper allowlists only `vars: { PUBLIC_WORKSPACE: 'enabled' }` after validating the shared closed-cloud baseline; it never copies arbitrary environment variables into the Worker.

## What runs

Push the reviewed application and workflow to `master`, or select **Actions → Deploy production → Run workflow**, branch `master`. Dispatches on other branches are skipped. The job has only `contents: read`; checkout does not persist GitHub credentials. Official checkout/setup-node actions are pinned to immutable commit SHAs, Node 24 is selected, and no dependency cache is restored.

One production concurrency group serializes runs with `cancel-in-progress: false`. GitHub may replace a pending run with a newer pending run; this is not a guarantee to deploy every intermediate commit. Running migrations/deployments are not cancelled by a later push.

The job:

1. Runs `npm ci`, consuming `package-lock.json`; Wrangler and Vitest are the installed locked binaries, never an on-demand `npx` download.
2. Validates all target variables against this exact installation and generates `.ci-production.json` from an allowlisted cloud configuration. It never reads the ignored production config. The safe alias is `"./ai-local": "./worker/ai-disabled.ts"`, the only required secret is `GEMINI_KEY_MASTER`, and assets are exclusively `dist`.
3. Rejects tracked `.dev.vars*`, `.env*`, `.local-state`, `.wrangler` and `ai-local.ts` paths without reading their contents. Dotenv loading is disabled. The reviewed SQL filename allowlist is `0001_private_accounts.sql` and `0002_gemini_account_keys.sql`; adding a migration requires deliberately reviewing/updating this allowlist.
4. Runs typechecking, the core suite, and **explicitly** runs `cloud-launch-policy`, `cloud-secret-policy`, production bundle isolation, CI deployment, and public-workspace Worker/store/UI tests. This does not depend on the package's default test list including secret-policy tests.
5. Builds assets, runs the security boundary check, and writes `dist/__release.json` containing only the full triggering commit SHA.
6. Uses the Cloudflare token only in the remote preflight/migration/deploy/verification steps. Preflight requires the existing exact D1 ID **and name**, and the existing Worker master-secret metadata.
7. Applies pending reviewed migrations with `wrangler d1 migrations apply neoform-bca721354a-data --remote --config .ci-production.json`, then runs `wrangler deploy --config .ci-production.json`. Neither operation runs before all local gates pass. This is a live schema update, not a D1 reset or database creation.
8. Rechecks remote metadata and fetches the public `https://<worker>.<account-subdomain>.workers.dev/__release.json?sha=<commit>` with no credentials, normal TLS, no redirects and cache bypass. Only an exact SHA match succeeds; transient propagation is retried for a bounded period. HTML fallback, login pages, HTTP failures and stale releases fail verification.

The release marker is intentionally **public and nonsecret**. It contains no user data, environment values or token. It verifies code/assets release identity, not every application feature or the unchanged value of an unreadable secret. Remote metadata checks prove presence/name/type, not a cryptographic comparison of the encryption master.

## Failure handling / first-run verification

Missing variables, a missing/underprivileged token, target mismatch, missing master, an unreviewed migration, or a failed test stops the job. Do not fix missing-master errors by provisioning a new secret. Restore the original master through an independently authorized recovery process.

After the owner pushes and configures the repository, inspect the real GitHub Actions run and the final verified SHA. A local passing suite is **not** evidence that GitHub Actions or production deployment has run. No remote CI run/deployment is performed by this implementation task.

A deployment can fail **after** a migration succeeded, or public verification can fail after a deployment succeeded. Inspect the exact state and preserve data; do not blindly reset/recreate D1 or rerun master provisioning. Migrations must remain compatible with the previous Worker during rollout. Rolling back Worker code does not undo D1 migrations. No automatic rollback is attempted.

For local non-production verification:

```sh
node node_modules/vitest/vitest.mjs run tests/ci-deployment.test.mjs tests/cloud-launch-policy.test.mjs tests/cloud-secret-policy.test.mjs tests/v2-security-deployment.test.mjs
npm run typecheck
npm test
npm run build
npm run security:check
```

The CLI integration test uses only a disposable repository with synthetic empty fixtures; it makes no Cloudflare calls. Its scratch root is `RUNNER_TEMP` or `TMPDIR`. Never manually run its remote commands using personal OAuth credentials. Generated `.ci-production.json` and the release marker are CI artifacts, not checked-in configuration.

## Official references checked

- GitHub checkout action and `persist-credentials`: https://github.com/actions/checkout/tree/v7.0.1
- GitHub setup-node action, Node selection and disabling implicit caching: https://github.com/actions/setup-node/tree/v7.1.0
- GitHub workflow concurrency: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- Cloudflare required secrets / preserving existing secret bindings: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Wrangler commands / remote D1 migrations: https://developers.cloudflare.com/d1/wrangler-commands/
- Cloudflare token authentication: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/

The action tag commit IDs were resolved against the official action repositories, not a third-party deployment action. No GitHub repository setting, secret, remote token, push, commit, database or deployment was changed by the child implementation.
