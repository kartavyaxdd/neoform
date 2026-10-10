# Open NEOFORM

## Current status
The application is built, works against a real local Worker/D1 backend, and has been exercised with disposable QA accounts. Permanent online deployment is blocked by missing Cloudflare authentication. A local address, GitHub repository, dry-run bundle or temporary preview is NOT a permanent cloud launch.

## Use it on this PC now
Open `http://127.0.0.1:8788` while the local server is running. Create your own app account. No owner credentials or completed workouts are seeded.

After a restart, double-click `START-LOCAL.cmd` in this folder. It builds the app, applies local migrations and starts the server. Keep its window open. Local private data is stored under `.local-state/`; back it up and do not delete it. This database is separate from the disposable `.qa-state/` test database. Local mode does not synchronize with a phone or continue while this PC is off.

## Activate permanent phone + PC access
Double-click `LAUNCH-CLOUD.cmd` when you can complete Cloudflare sign-in in your own browser. Use an account on the free Workers/D1 plan. The launcher does not collect your password, choose a paid plan, purchase anything, accept temporary-account policies, or upload local test data. If you belong to multiple Cloudflare accounts, it stops rather than choosing an unrelated account; run it with `--account-id YOUR_AUTHORIZED_ACCOUNT_ID`.

The launcher uses a fresh unique Worker/database namespace and a separate `wrangler.production.jsonc`, applies this app's migrations, deploys the built app, then checks the public HTTPS shell and `/api/health`. Only after those checks succeed does it save `CLOUD-URL.txt`. It has been exercised through the unauthenticated preflight and correctly stops; actual remote provisioning/deployment has NOT run yet. Post-deployment registration/login, account isolation and same-account cross-device persistence must still be verified on the real HTTPS runtime before calling the cloud launch complete.

Local accounts are not automatically copied online. Create your own online app account. If you have local workouts later, export your private versioned JSON backup and deliberately import it into that account.

## Important limits
- Original rule-based progression suggestions; not proprietary MacroFactor/RP algorithms and not medical diagnosis.
- No email password-reset service or real push-notification delivery. Remember your unique passphrase.
- Offline caches and exported JSON/CSV are not encrypted at rest. Use trusted devices and private backup storage.
- A bounded 2 MB account snapshot/backup budget is enforced before local changes become unsyncable. Back up before deleting older records.
- Offline logout clears this device's private cache; it cannot guarantee revocation of a server session without connectivity.
- Sync merging uses a known common base. Ambiguous edits/deletions are rejected; export both copies before choosing explicit replacement.

Node 24+ is recommended; actual development/testing used Node 26.7.0. Locked dependencies are in `package-lock.json`.
