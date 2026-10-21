# Gym experience release

Implements the approved compact logger and rewards plan without changing training
prescriptions, progression policy or historical observations.

- Observed records compare matching exercise, setup, equipment, convention,
  method and phase. Same-load rep records and same-rep load records require a
  prior baseline. Straight numeric external loads and machine labels are
  supported; warmups, bodyweight/band conventions and advanced sequences are
  excluded. Machine labels remain labels, never estimated kilograms.
- Saved history derives 100 XP per training date plus at most 25 PR XP for that
  date with explicitly reported effort. No reward ledger or imported-history
  celebration replay. Levels are 500 XP; milestones are 10/25/50/100 dates.
- Exercise moves preserve IDs and observations. Linked groups move/remove as a
  unit. Undo restores removed items into the current draft rather than restoring
  an earlier whole-session snapshot. Future routine ordering requires a separate
  explicit action. Existing coaching context keys include actual exercise order.
- Feeling is optional and independent of fatigue. Pain remains an explicitly
  reported observation. Bulk execution/rest confirmation never fills in RIR.
- The RIR hue is absolute, red at 0 through green at 10, including warmups and
  deloads. Grey means unknown. It is descriptive and has no reward effect.

## Rest alerts

`/api/rest-alerts/config` exposes feature availability and the public VAPID key.
Installation capabilities and subscriptions live outside shared workout state
and backups. The browser uses separate IndexedDB storage; each server installation
uses a SQLite Durable Object. One versioned alarm is active per installation.
Same-origin/account guards, device capabilities, push-host allowlisting and
registration/device rate limits constrain operations. Notification text is fixed
and contains no personal training details.

The service worker checks the current local timer identity/version and expiry,
and suppresses repeated deliveries. Offline changes invalidate local deliveries;
reconnection reconciles only the latest timer state. Background delivery is never
promised for an unarmed offline timer. Server alarms and OS delivery can be late.
Audio is unlocked by timer/set interaction; an armed server alarm uses OS sound
instead of duplicating the foreground chime.

Production provisioning: generate the existing installation config, then run
`node scripts/setup-rest-push.mjs`. It checks names only, refuses partial pairs or
rotation, and provisions only the two new notification-signing keys through a
memory-only pipe. It does not read or replace the existing encryption master.
Deployment adds only the approved `RestAlertDevice` SQLite migration and binding;
the existing D1 database and public-workspace mode remain selected.

## Verification boundaries

Automated gates cover observed PRs, XP caps/recalculation, grouped moves/removal,
target preservation, real isolated Worker/D1/SQLite Durable Objects, encrypted
push payloads/retries/cancellation, and browser flows at 360/390/desktop including
offline persistence and explicit feedback. Browser subscription/permission tests
use synthetic browser responses and never send to external push providers.

**Physical iPhone acceptance remains manual.** From the installed Home Screen app,
enable rest notifications and send a test. Lock the device for a timer, then check
pause/resume/extension/replacement, Focus, denial/re-enabling and offline behavior.
Chromium emulation and a synthetic push-service response do not prove actual
Apple lock-screen delivery or sound.

References: [official workout guide](https://macrofactor.com/wp-content/uploads/2026/01/Workouts-Quick-Start-Guide.pdf),
[Apple Home Screen Web Push](https://webkit.org/blog/13878/),
[Cloudflare SQLite Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
