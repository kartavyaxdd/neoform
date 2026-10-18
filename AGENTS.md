# NEOFORM project instructions

Preserve all existing personal accounts, programs and workout history. Personal persistence is `.local-state`; test fixtures belong only in isolated `.qa-state`. Do not inspect secrets, personal sessions, provider keys or password records while implementing/testing.

Training behavior is governed by `TRAINING-PRINCIPLES.md`, adopted at K's request from *Scientific Principles of Hypertrophy Training* (2020). Read that contract before changing programming, volume, effort, recovery, progression or AI generation. It separates source claims, original app choices, actual implementation and future acceptance gates. Chapter notes/visual corrections are in `.planning/book-notes/`; exact source identity/coverage is in `SOURCE.json` there. Do not invent source-page citations or equate hypotheses/heuristics to measured personal biology.

Preserve approved compact mobile workout UI: light neutral Workout home, weekly strip, one exercise at a time, aligned target/load/reps/completion rows and advanced controls in sheets. Training intelligence must not crowd the primary logger. Check360/390px layouts.

Use test-driven changes, actual Worker/D1 QA and browser verification. Keep user-visible targets consistent with actual set targets. Missing observations are unknown; pump/soreness do not prove growth. No silent personal-program rewrites or static templates marketed as live AI.

Local no-login mode is explicitly opt-in and bound to the existing account. Never enable it in public/production hosting or remove ordinary authentication globally. Verify exact live boundaries before reporting availability.

## Required release workflow — K's standing instruction

For every major code change that affects NEOFORM's behavior, features, UI, data, or deployment, finish the release to BOTH GitHub and the public hosted app. A local-only implementation is not a completed delivery.

1. Test and build the change; preserve existing user data and exclude credentials, private databases, local state, and generated evidence from Git.
2. Commit the reviewed project-scoped changes and push to `kartavyaxdd/neoform` on the production branch (`master` unless deliberately changed). Verify the remote commit matches the intended release.
3. Deploy that same committed release to the existing public Cloudflare application. Prefer the verified push-triggered workflow; if automation is unavailable, use the authorized manual deployment path rather than treating a push as a deployment. Preserve the existing database, encryption master, and explicitly selected access mode. Do not create a replacement installation or revert the public-workspace flag accidentally.
4. Verify the actual public HTTPS app, relevant changed user flow, and full commit SHA at `/__release.json`. Do not claim the app is updated based only on a local test, successful push, asset upload, or queued CI run.
5. Report the GitHub commit and public release outcome separately. If authentication, approval, missing CI secrets, or a failed check blocks either destination, state the exact blocker and mark the release incomplete; never silently leave the major change local-only.

This is standing authorization for routine testing, project-scoped commits/pushes, and deployment to the existing app after major changes; do not repeatedly ask whether to publish each time. It does not authorize purchases, billing changes, exposing secrets/private records, destructive migrations, or bypassing a denied/timed-out tool approval. Explicit user instructions to pause, keep a change local, or not deploy override this default. Documentation-only instruction changes do not require a new app deployment unless they alter runtime behavior.

