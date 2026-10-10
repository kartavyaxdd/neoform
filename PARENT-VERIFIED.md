# NEOFORM — independent verification

Status: working local application; NOT a completed permanent cloud launch.

Parent reran against the actual local Worker/D1 QA backend:
- TypeScript typecheck: passed.
- Core/domain/synchronization tests: 44 passed across 12 files.
- Real API tests: 7 passed across 2 files.
- Chromium full-stack browser tests: 7 passed, no retries, 1.4 minutes.
- Cloud-launch policy/configuration tests: 6 passed.
- Production Vite build: passed. Zod annotation warnings are non-fatal.
- Personal local instance at http://127.0.0.1:8788: health returned {"ok":true}; app shell returned NEOFORM assets.

QA exercises registration, onboarding, editable programs, set completion/undo, draft refresh, history/analytics/backups, separate browser persistence, offline conflicts, cross-account isolation, shared-cookie account switching, offline logout, custom exercises, recovery/progression, password/account controls, mesocycle duplication/archive and machine labels.

Visually reviewed dark desktop overview and the 360px mobile logger. Screenshots use disposable test accounts, not K's workout history.

Fixed a release-preflight defect: the cloud launcher uses JSON.parse for its checked-in base configuration, but the JSONC file contained trailing commas. Removed the trailing commas, reproduced parser success, and added a configuration regression test.

Outstanding cloud release gates:
1. An authorized permanent Cloudflare hosting account must be authenticated; Wrangler currently reports unauthenticated. No temporary account was accepted or deployed.
2. Provision D1, apply remote migrations and deploy free-plan HTTPS hosting.
3. Verify deployed registration/login, private-data isolation and cross-device persistence, including CPU/runtime behavior.
4. Review the documented password-KDF work-factor limitation in SECURITY.md before public release.

See OPEN-NEOFORM.md for local startup and the prepared cloud launcher. Do not confuse local availability with phone/PC cloud access. No private QA databases, credentials, browser traces or account state are included in the distributable source archive.
