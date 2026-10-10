# NEOFORM

Private, intentional hypertrophy training. React + TypeScript + Vite, Cloudflare Worker API, D1 SQLite, original styling. No paid services. No deployment performed by this implementation run.

## Local launch

Use Node 22 LTS or newer supported by Wrangler. From this directory:

```
npm ci
npm run db:migrate
npm run dev
```

Open http://localhost:8787. Register your own account in the app. Local storage is under `.wrangler/state`; do not delete it if you want to retain local accounts. There are no seeded owner credentials or completed workouts. `npm run build` rebuilds client assets; Wrangler reloads Worker changes.

## Isolated QA

```
npx wrangler d1 migrations apply neoform --local --persist-to .qa-state
npm run build
npm run dev:qa
```

In another terminal: `npm test`, `npm run test:api`, `npm run test:browser`, `npm run typecheck`. API and browser tests create disposable `@example.test` accounts in the QA database. Do not point QA at a personal or production server. The core suite also controls request timing for race tests; browser tests use the real API and D1. Actual red/green execution evidence, the final acceptance checklist and screenshots live in `evidence/` and [.planning/ACCEPTANCE.md](.planning/ACCEPTANCE.md).

This run used Node 26.7.0 and the existing installed Chrome executable at `C:/Program Files/Google/Chrome/Application/chrome.exe`. No browser installation or other application changes were required. On another machine change `playwright.config.ts` to its installed Chromium executable, or install Playwright's Chromium and remove that executable override. Locked versions are in `package-lock.json`.

To keep browser reports separate during concurrent review, set `NEOFORM_QA_OUTPUT` to a project-relative directory before running Playwright. The final acceptance run uses `evidence/final-browser` (PowerShell: `$env:NEOFORM_QA_OUTPUT='evidence/final-browser'`). Its report, JSON and artifacts are written there. Avoid rebuilding assets while a browser suite is running against Wrangler.

## Hosting handoff — parent only

`wrangler.jsonc` uses a placeholder D1 UUID for local development. Parent must provision a permanent free-plan D1 database in an authorized existing Cloudflare account, replace that binding UUID, run remote migrations, then deploy the built Worker and static assets. The implementer must not deploy or accept temporary account policies. No secrets belong in client assets or git. No environment secrets are required for local use; the D1 binding is server only. Choose HTTPS in production; session cookies are Secure on HTTPS. Review platform usage quotas before launch. Deployment and remote-runtime validation remain the parent's responsibility.

## Backup and restore

Settings exports a versioned JSON backup (profile, programs, custom exercises, sessions, active draft and timer; never passwords or session tokens). Import validates the entire file, rejects files over 2 MB and asks for merge or replacement. Import merge keeps distinct IDs and gives imported versions precedence for matching IDs. Make a backup before replacing. CSV exports completed session sets with canonical kg for standard loads, a separate raw `machine_label` column, and convention/equipment columns. Machine labels never change with kg/lb preferences. Files are unencrypted: store them privately. Parent should also back up D1 using the provider's export facility before migrations. Restore JSON through the app in the intended account; private data remains scoped to that account.

## Offline use and conflicts

After one online visit/sign-in, the public shell and your account's draft are available offline on that device. The sync badge distinguishes local pending edits, offline state, sign-in expiry and conflicts. A server revision mismatch pauses writes. Safe sync merge uses the saved common base to preserve independent edits and deletions; it refuses competing edits or conflicting ordering. Export both copies before choosing explicit cloud/local replacement. This is deliberately different from backup-import precedence. Logging out removes private device caches; pending edits must first sync, export or be explicitly cleared. An offline logout cannot revoke an unreachable server session and shows that limitation.

## Training and release limits

Coaching is a documented deterministic heuristic, with explanations and explicit accept/defer/decline choices. It requires comparable working-set history, holds on poor recovery/pain, caps load increases and does not infer increments for machine labels. Direct muscle hard-set totals exclude warmups; indirect compound involvement is explained separately. Estimated 1RM is restricted to comparable positive total-barbell loads and at most 12 reps. Programs advance weeks through visible choices. Preferences support in-app reminders and a browser-dependent timer chime; background push and email password reset are not provided.

The runnable local product is tested. Remote hosting, production HTTPS and provider CPU/security validation are separate parent steps. Review [SECURITY.md](SECURITY.md), including the native password-KDF work-factor limitation, before public release.
