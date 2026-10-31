# Android and Health Connect

NEOFORM Android reuses the compact React app and existing Cloudflare backend. The
package is `app.neoform.android`; personal APK distribution precedes Play Store
publication. Browser and Android device storage are separate. Sync/export pending
browser changes before switching. Android cannot recover an unsynced browser draft.

## Private data boundary

The native bridge permits only the existing HTTPS API origin and bundled local UI.
Its encrypted native cookie jar retains ordinary profile authentication. API requests
keep account headers, abort signals and epoch checks; no CORS or public authentication
policy is relaxed. External links open outside the WebView. Release bundles reject
remote frames/scripts. Android OS backup is disabled.

Health Connect is read-only: steps, sleep sessions, weight, logged nutrition energy
and resting heart rate. Android 13 and earlier need the separate Health Connect app.
Availability and each permission are checked independently. The first release reads
foreground-only, up to 30 available days; there is no historical/background permission,
sensor subscription, health-data write, diet-target import or proprietary readiness API.

Health records and source preferences live in an Android Keystore-encrypted,
non-backed-up file, separate from workout state. Only the server-authenticated locked
Sharma profile can expose them; switching/locking invalidates reads. Cloud state,
exports/backups, Gemini prompts, analytics and logs never receive records. Only a
user-confirmed ordinary readiness factor can enter existing workout state.
Disconnect revokes this app's permissions and removes its cache. Delete imported data
removes the cache and stops automatic import until reconnected; neither deletes source
records. Permission revocation filters cached records before display. Sync replaces the
30-day snapshot, reflecting edits/deletions; incomplete/failed imports cannot establish
confident coaching context. A 10,000-record safety cap is disclosed as partial data.

Steps use Health Connect aggregation and source priorities. Other metrics select a
single source: automatic chooses the source with most records, ties by package name;
an explicit missing source never silently falls back. Sleep session intervals are
unioned per local wake date; session duration may include awake time and is labelled
accordingly. Nutrition sums logged energy from one source and is always potentially
incomplete. Resting HR is not inferred from generic heart-rate samples.

## Coaching policy (original software heuristics)

Metrics are descriptive, not a recovery score. Baselines are medians of at least seven
distinct prior daily observations in the preceding 21 days from the same source.
Unknown permissions, missing records, records older than 48 hours, future observations
and snapshots older than 24 hours cannot support current review cues. Partial imports
disable cues. The UI shows source, date, permissions and freshness.

Sleep session time more than 60 minutes below its prior median suggests asking whether
sleep actually was poor. Steps above both 1.5 times the prior median and 3,000 above it
suggest asking whether activity was unusual. These are review prompts, not validated
physiological cutoffs. Confirmation adds only `poor-sleep` or `unusual-activity` to the
optional readiness form. Saving still requires the existing explicit present-tense
confirmation; pain/fatigue/muscle recovery and observation timestamps are not fabricated
or cleared. During working sets readiness remains read-only.

Existing performance-based coaching gates interpret confirmed context; imported data
never assigns loads/reps/RIR/sets, clears pain vetoes, or implies good recovery. No
calorie-deficit, growth, HRV, Welltory-score or automatic volume model is added.

## Android behaviour

Bundled assets work offline without a service worker. The existing durable workout
store remains authoritative. Native rest alerts replace Web Push on Android, using one
versioned alarm, fixed non-personal text and a 120-second delivery expiry. Pause,
replacement, timer end, Undo and profile changes cancel/replace it. Android notification
channels control lock-screen sound; timerSound selects the sound/silent channel.
Foreground chime preferences remain. Inexact alarms need no exact-alarm privilege;
Doze and OEM battery restrictions can delay or suppress alerts. Reboot does not restore
an old alarm; reopening reconciles the active draft. A scheduled notification is not a
promise of exact delivery. No purchases, external push service or battery bypass.

Android Back closes the active sheet, then returns to Workout. Posters use the native
share sheet or Android Downloads. On Android 9, Save falls back to sharing rather than
requesting broad external-storage access.

Native notification permission/channel status is refreshed on return. A recorded
delivery for the exact timer deadline prevents a duplicate foreground chime on reopen.
Tutorial playback opens YouTube outside the app on Android; remote frames never receive
the native bridge. The browser retains embedded tutorial playback.

## Build and release

Use Node 24+, JDK 21 and Android SDK 36/build-tools 36.0.0. Install locked npm
dependencies, run `npm run android:sync`, then use the checked-in Gradle wrapper for
`:app:assembleDebug :app:testDebugUnitTest`. Android 13/API33 and current API36 emulator
coverage are separate from physical Nord CE 2 qualification.

Local verification compiles both APKs and tests native API/profile/alarm rules. The
device suite additionally checks Keystore encryption, backup exclusion, permission
defaults, cancelled alarms, and loading the actual bundled UI/native bridge. CI has
separate accelerated API33/API36 jobs. This Windows machine currently lacks an Android
emulator acceleration driver; its software API36 boot attempt exceeded the five-minute
QA deadline. Do not report that attempt as a passing device test or silently change
Windows virtualization settings. Phone/ring exports and screen-off notification timing
remain separate physical-device acceptance checks.

After gates and a clean reviewed commit, `npm run android:release` builds exact-SHA web
assets, synchronizes Capacitor, compiles/tests release Kotlin, generates/reuses the
installation's private signing identity under `~/.neoform-android-signing`, aligns,
signs and verifies the APK. Signing credentials and build output never enter Git.
Keep that signing directory safe: losing it prevents in-place updates under the same
identity. The APK, checksum and manifest are staged under `dist/downloads/` for the
existing Cloudflare deployment. Verify `/__release.json`, `/downloads/release.json`,
download checksum and profile boundaries after deployment. Do not run an ordinary web
build between staging the APK and deployment; it replaces `dist`.

For later web-only releases, run `node scripts/preserve-android-download.mjs` after the
web build and before deployment. CI does this automatically and fails closed if the
published artifact cannot be validated. It preserves the last signed APK and its own
source manifest; a web update must not silently remove the Android download or relabel
an older APK as having been rebuilt from a newer commit.

The public web download is `/downloads/neoform.apk`; its manifest records full source
SHA, package, version, size and APK SHA-256. This APK contains no personal records or
provider credentials. Health Connect data availability from boAt Crest and Welltory
must be checked on the actual phone; browser bridge fixtures do not qualify sensors,
Android permission dialogs or screen-off delivery.
