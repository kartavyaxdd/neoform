# NEOFORM

NEOFORM is a compact workout logger and optional mini coach built with React, TypeScript, Vite, a Cloudflare Worker and D1. The mobile logger shows one exercise at a time. Equipment setup, readiness, technique controls and coaching explanations stay in sheets.

The existing public app is [NEOFORM](https://neoform-bca721354a.kartavya-neoform.workers.dev/). It deliberately uses **public-workspace mode**: anyone with the URL can view and change the shared workspace. Ordinary private-account authentication remains available in authenticated installations. Private accounts, provider keys and AI generation are blocked in public-workspace mode. Local no-login mode is a separate opt-in loopback-only configuration.

Training policy is governed by [TRAINING-PRINCIPLES.md](TRAINING-PRINCIPLES.md). Deterministic guidance requires confirmed comparable performance and current readiness; it explains uncertainty and never measures growth or personal volume landmarks. Available load selections constrain proposals. Applying a proposal is explicit and does not rewrite a program or historical workout. The full remaining scope is tracked in [docs/IMPROVEMENT-PLAN.md](docs/IMPROVEMENT-PLAN.md).

Private installations can optionally use the bounded Gemini integration with account-scoped encrypted keys. Provider access is separate from deterministic coaching, and there is no static template marketed as a live AI response. Do not run provider provisioning or legacy sidecar/proof scripts as part of ordinary QA. The ignored local runtime module must remain untracked; production and QA use the disabled-module alias. `npm run security:check` checks the deployment graph and client assets without reading that runtime module.

## Local development

Use the locked dependencies and a supported Node runtime (CI uses Node 24):

```
npm ci
npm run build
```

Keep an existing personal installation on its already selected persistence directory. `.local-state` contains personal state and must be preserved. Do not switch its database binding or directory to create a replacement installation. For a new development installation, use the same explicit persistence directory for migration and server startup:

```
node node_modules/wrangler/bin/wrangler.js d1 migrations apply neoform --local --persist-to .local-state
node node_modules/wrangler/bin/wrangler.js dev --local --port 8787 --persist-to .local-state
```

Open localhost:8787 and use ordinary registration/sign-in. These commands are for personal development; tests must use the isolated harness below. No owner credentials or completed workouts are seeded.

## Isolated release QA

```
npm run typecheck
npm test
node node_modules/@playwright/test/cli.js install --with-deps chromium
npm run test:integration
```

`test:integration` builds assets, creates a unique directory under `.qa-state`, applies migrations to a fresh local D1 database, starts its own Worker on unused loopback ports, and runs the provider-independent API and selected browser release gates. It disables dotenv loading and inherited provider/deployment credentials. It never attaches to an existing app listener. The harness terminates its owned process tree, checks that its listener stopped, and invalidates the active run marker. Reports and screenshots stay inside that run's `.qa-state/integration-*/evidence` directory.

`npm run test:api` runs the API gate in its own fresh Worker. `npm run test:browser` does the same for browser gates. Do not manually start another server or edit the browser configuration. The default uses Playwright's installed Chromium. To use an existing browser executable locally, set an absolute `NEOFORM_QA_BROWSER` path; for example in PowerShell:

```
$env:NEOFORM_QA_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:integration
```

API gates cover authentication, account isolation, revision conflicts, input boundaries and exact training metadata persistence against real D1. Browser gates cover readiness, equipment, explicit program saves/activation, offline journals, phase targets, accessibility and 360/390px layouts. Synthetic AI previews are intercepted fixtures, not provider calls. The selected gate does not run every historical browser/probe suite: encrypted-key integration, live-provider qualification, and local no-login/provider rehearsals need their own isolated setup. `npm run test:public` separately verifies the actual public-workspace Worker and browser, and runs in deployment CI. No ordinary test is evidence of a live upstream AI response. Never copy an owner's key, session or database into QA.

CI installs the locked Playwright browser and runs these gates before any remote migration or deployment. A failed gate blocks release. The separate remote metadata preflight also requires the existing exact database and encryption-master metadata; it never creates an installation or rotates the master.

## Hosting and releases

Production is the existing Cloudflare installation on GitHub `master`. Releases must push the reviewed commit, deploy that same committed code and verify the full SHA at `/__release.json` plus actual HTTPS changed flows. Preserve its database, encryption master and explicitly selected public-workspace flag. GitHub code/QA checks and public release verification are distinct outcomes. An authorized manual deployment is required when push-triggered deployment is unavailable; a push alone is not a deployment. No credentials or private local state belong in Git or client assets.

Cloudflare remains the current host; free hosting depends on provider quotas and continued plan availability, not a lifetime guarantee. Usage efficiency and backup/restore work remain on the improvement plan. No billing changes are required for ordinary app deployment.

## Backup, offline behavior and current limits

Settings exports versioned JSON with profile, programs, custom exercises, sessions, readiness, active draft and timer, without passwords, session tokens or provider keys. Import validates the file and offers explicit merge or replacement; make a backup before replacing. CSV preserves canonical kg separately from raw machine labels. Exported files are unencrypted and should be stored privately.

History now uses normalized, revision-pinned pages and atomic delta commits, with an IndexedDB draft cache and retry queue. Version 2 JSONL backups are checksummed and streamed; version 1 JSON imports remain supported. Individual metadata/workout records remain bounded near 2 MB, histories at 50,000 sessions, and pending cloud transfers at 100 MB/100,000 mutations per owner with four active uploads. Database/provider quotas still apply; no unlimited or lifetime hosting guarantee is made. A real large-history restore and offline reload are release gates.

After an online visit, the shell and saved draft can work offline. Sync uses revisions and separate tab journals; competing edits require explicit review, and Settings can export pending copies. Missing observations remain unknown. Existing accounts, programs and workout history must never be silently rewritten or truncated. See [SECURITY.md](SECURITY.md) for authentication/runtime limitations and [AGENTS.md](AGENTS.md) for standing release and data-preservation instructions.
