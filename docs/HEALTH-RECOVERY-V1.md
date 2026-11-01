# Private health sync and recovery v1

This release extends the Android-only Health Connect integration. It preserves the existing Cloudflare/profile boundaries and does not migrate cloud data.

## Import and privacy

One unique WorkManager periodic task requests an import every 12 hours, with a 12-hour initial delay and bounded exponential retries (30-minute backoff, at most three retries). Foreground open/resume and Sync now remain available. Reads need no internet connection. Android can defer work, force-stop prevents scheduling until the app is reopened, and source apps may upload late: neither two successful daily imports nor fresh ring records are guaranteed.

Background permission is requested only by Enable private background imports, after checking the provider's feature API. Denial, unsupported providers and revocation preserve foreground use. An encrypted local enrollment authorizes Sharma imports independently of cloud-session expiry or profile lock, but cannot display readings, access workouts or call Gemini. Locking/switching hides the cache; logout, disconnect and delete-imported-data revoke enrollment, cancel work and invalidate pending commits. Manual and scheduled imports share one mutex. Generation checks fence source changes and cancellation before atomic encrypted writes. Failed/partial imports cannot support current recovery guidance.

Snapshots are version 2; version 1 remains readable without invented sleep stages or HRV. Data includes original IDs, source, supplied device/recording method, timestamps, units and per-metric import status. Read-only grants cover the existing five categories plus optional HRV RMSSD, respiratory rate and supported skin-temperature deviations. Protein uses the existing nutrition grant. Sleep stages distinguish asleep/awake/session duration; overlapping or malformed stages cannot establish coverage. Generic heart rate, SDNN, proprietary Welltory scores and health writes are not added.

Health snapshots, settings, scores, source preferences and the automatic-reduction guard/Undo remain in the Keystore-encrypted, non-backed-up Android store. They never enter cloud workout state, existing exports/backups, Gemini requests, analytics or logs. User-confirmed ordinary readiness answers retain their existing workout-state behavior. No new permissions are silently granted.

## Recovery index: original experimental app policy

The index describes deviations from a personal baseline; 100 does not mean 100% recovered or healthy. It does not reproduce Welltory, diagnose illness, establish growth, or measure local-muscle recovery.

Core components are stage-qualified sleep, resting HR and RMSSD. Sleep requires at least 90% known nonoverlapping stage coverage; session time alone is descriptive. Each component needs 14 distinct prior days in the preceding 28 days, matching source, supplied device, recording method and measurement context. Unknown supplied context stays labelled unknown rather than being described as a standardized morning measurement. Present observations and the complete import must be no more than 24 hours old. Sleep plus at least one cardiac component are required; otherwise the UI says Building your baseline or Insufficient current data.

Use daily medians. HRV uses natural log RMSSD. Scale is max(1.4826 × median absolute deviation, floor), with floors 45 minutes sleep, 3 bpm resting HR, and 0.10 log RMSSD. Adverse deviation is (baseline-current)/scale for sleep/HRV and (current-baseline)/scale for resting HR, clamped to 0–4. Component index = 100 − 25 × deviation. Weights sleep .40, HRV .35, resting HR .25 are renormalized over eligible components, then rounded to an integer. Bands: >=75 Usual signals; 50–74 Caution; <50 Lower signals. Two components yield moderate coverage confidence; all three with >=21 baseline days yield higher coverage confidence. These labels are not predictive-validation claims. Respiratory rate, temperature, activity, weight and potentially incomplete intake are explanatory context, not score penalties. No deficit is inferred.

The private seven-day trend reconstructs eligible days from currently available records using only observations at or before each displayed time; it is not a claim that the estimate was available then. Baselines and score weights are software choices needing future validation, not biological thresholds. Absolute HRV elevations or lower resting HR earn no extra bonus.

## Training integration

The score never writes a check-in or training target. Automatic next-set reduction is off until explicitly enabled on the phone. Eligibility requires a current score <50, a confirmed check-in within the existing 12-hour window reporting fatigue >=3 and pain=false, and a separately confirmed current usual-rest/consistent-execution review. Existing pain, local-recovery and severe-fatigue vetoes take precedence (fatigue >=4 therefore pauses rather than auto-reduces).

The existing next-set engine must independently return a load reduction after reported effort and a real rep/reserve miss. Only the next uncompleted, unedited straight working row can change after rest ends, without focused numeric inputs. Select the nearest available lower load within the smaller of 10% or 5 kg. Unsupported conventions, unknown inventories, linked/advanced methods, altered rows and planned back-offs remain manual. Preserve reps, RIR, dose, completed observations, programs and future targets. The actual upcoming load and its displayed prescription change together; the ordinary proposal marker carries no health score or records.

Reserve one reduction per session/exercise in encrypted native storage before attempting the ordinary durable workout save. Repeated events, reloads, Undo and reconnecting cannot reserve it twice. Consumed guard keys contain only ordinary workout/exercise IDs and survive disconnect; imported health records and pending private Undo are deleted. Fail closed after a crash or intervening edit; a consumed reservation may require manual review even if no change was ultimately saved. Targeted Undo is available for the latest unchanged pending row, including after reload, and preserves other edits. Corrected/completed rows cannot be overwritten by Undo. Background sync alone is not a training event and never edits a workout.

## Performance and verification

Clock displays/rest feedback own their ticks instead of updating the app root each second. Chart/trend work stays behind explicit expansion. Android scrolling cards avoid backdrop blur; stationary sheets/navigation retain reduced glass. Existing 120/180/240 ms control/content/sheet timing and accessibility preferences remain. Numeric inputs do not animate or move during typing.

Tests cover core math, baseline boundaries, stale/partial/missing data, identity changes, legacy data, guarded apply/Undo, native stage coverage, cancellation fencing and bounded retries. Isolated Android instrumentation additionally checks durable encrypted enrollment, cancellation and one-per-exercise guards, and a disabled worker performs no import. Browser fixtures against isolated real Worker/D1 verify connection cancellation, recovery UI, preferences, auto-reduction/Undo/reload and health-data exclusion. Physical Nord delivery, source coverage and frame performance must be reported separately when no ADB device is attached.
