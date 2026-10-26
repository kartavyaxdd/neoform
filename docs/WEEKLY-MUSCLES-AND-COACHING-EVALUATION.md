# Weekly muscle coaching and training-block evaluation

## Weekly review

Dashboard → Weekly review now leads with a muscle-by-muscle summary. Primary working sets assigned in saved workouts and actual completed primary working sets are separate. Indirect involvement, advanced bouts and explicitly effort-qualified sets are labelled separately; they are never summed into a growth score. Qualification uses the existing app RIR <=4 estimate but requires explicitly reported effort here. Legacy unknown provenance stays unknown.

Assignments come from saved plannedWorkingSets. Current routine targets never reconstruct missing historical prescriptions. Accepted shorter plans retain their original entries and retained IDs, so accepted but entirely unlogged entries can still contribute assigned dose. Deliberately omitted entries are shown separately and create no make-up obligation. Other older logs can omit entire unlogged exercises; the review explicitly describes the recorded-assignment coverage limit.

Mixed legacy straight/advanced entries retain their actual working-set and advanced-bout counts separately. If the original straight-set assignment cannot be separated reliably, its assigned count stays unknown rather than displaying a fabricated zero.

Only explicit upcoming calendar occurrences have a current-routine dose estimate. Missed/skipped work is not reconstructed or added elsewhere. Active drafts are excluded. Historical views use current corrected workout records dated through the selected local week, exclude later timestamped muscle reports and later workouts, and label calendar plans edited after the week as having unknown prior status. They do not reconstruct old database versions or guess when an untimestamped feedback correction was originally entered. Current recovery status is never inferred from an old favorable report.

One next action per muscle prioritizes unresolved recovery flags, missing evidence, accepted-change follow-up reviews, and existing program-review statuses. A single eligible follow-up stays Observe accepted targets rather than implying the accepted change is already established. Primary-muscle working dose, reported recovery and matching lift comparisons remain separate observations. Historical weeks have no live target action. Current-week target review routes to the existing future-program coaching sheet; opening it and reviewing readiness change nothing. Apply remains explicit and active workouts block future edits. No new persistence, API, database migration or backup format is introduced.

## Comparable evidence corrections

Failing regressions found weekly improvement claims across unknown phase and reported pain. Weekly comparisons now reuse lift-progress segments, preserving matching equipment/setup, convention, method, dose, preceding order and reported effort. Unclassified legacy techniqueGroup/repGoal metadata is excluded from straight-set coaching and response review. A later lift cannot use an incomplete or unconfirmed preceding working dose as a full-context progression baseline. These additional exclusions preserve historical records, policy fingerprint formats and existing progression limits; they do not rewrite outcomes or personal programs.

The preceding-dose check requires the earlier non-warmup work to be complete at its recorded planned count, with timely consistent-execution/usual-rest confirmation. Missing preceding evidence holds coaching; it cannot be skipped to recover a more favorable old baseline. This is an original conservative app rule, not a quantified model of fatigue transfer.

## Eight-week evaluation

`npm run test:coaching-blocks` executes 14 scripted eight-week blocks, each with 32 workouts (448 synthetic workouts total). Cases cover improving observations, repeated misses, unknown effort, shorter workouts/return after a gap, equipment changes/return, local recovery warnings and unknown follow-ups, systemic fatigue with broad confirmed declines, deload/return, changed execution, corrections/duplicate events, cutting with no volume additions, an explicitly accepted volume experiment, unclassified legacy sequences, and incomplete preceding work.

The fixtures drive the actual preview, durable-start preparation, coaching proposal/application, outcome ledger, response-review and weekly-review functions. Changes are accepted only as an explicit scripted user choice. Each case checks invariants on appropriate holds, context boundaries, blocked escalation and unique follow-up sessions. Positive cases must also offer actionable progression; the volume experiment must actually be reached and explicitly accepted. Rep restorations are classified as reductions rather than increases in report metrics.

The isolated `.qa-state/coaching-blocks-<uuid>/` report includes all Vitest results, per-case traces and summary metrics. No account history, provider key, personal state or external provider is loaded. The same cases are included in the ordinary unit gate and CI. A failure returns a non-zero status and the report records incomplete/failed execution.

These are scripted observations and behavioral tests, not simulated physiology, causal validation, forecasts of personal progress or proof of optimal volume. Real comparable training data remains necessary to assess usefulness. No escalation caps, automatic volume increases or growth claims are added.

## Release verification

Focused regressions, the full unit/type/build/security gates, actual isolated Worker/D1 and 360/390px/desktop browser flows verify known/unknown effort, partial and shortened assignments, matching progress, historical cutoffs, offline viewing, explicit future-target acceptance and backup compatibility. Hosted checks use the actual release assets with synthetic intercepted training data; the complete live commit SHA is verified separately from GitHub push.
