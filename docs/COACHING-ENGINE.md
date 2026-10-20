# Reviewed next-session coaching

`coach-v1` is a deterministic, offline-capable NEOFORM policy connecting confirmed performance to reviewable targets. It does not measure hypertrophy, discover biological volume landmarks, or guarantee optimal training. Source distinctions remain in `TRAINING-PRINCIPLES.md`.

## Using it

Open **Review next workout** on Workout home or **Next workout coach** in Exercise options. Readiness and finish feedback are optional. Review the evidence and individual rows, then accept, edit, decline or defer. Session scope is the default; set-count, rep-range, substitution and deload changes require explicit future-program scope. Bundles allow one alternative per exercise and cannot establish which component caused a response.

For manual baseline work, set comfortable loads before starting, then use **Targets / Use current unlogged rows as manual plan**. Changing actual performance does not rewrite assigned targets. At finish, explicitly confirm accurate actual RIR, execution and rest when known. Imported effort, missing prescriptions and unanswered observations stay unknown.

Preferences include a 75-minute planning budget, reported diet phase, early-trial permission and muscle priorities. Optional dated bodyweight supplies comparison context; added-bodyweight resistance is never automatically converted to total kilograms.

## Original software policies

- Compare at most eight eligible exposures over 56 days. Changed setup, phase, dose or preceding exercise order starts a new evidence segment. After 21 days without eligible performance, re-establish a baseline.
- Escalation requires full planned straight-set dose, confirmed effort, consistent execution/usual rest, fresh reported readiness and no applicable pain or recovery veto. Advanced sequences and neck-load progression remain manual.
- After one eligible exposure, propose one additional total rep on one row. After two ceiling exposures, use the smallest selected normal increment within the smaller of 2.5% or 2.5 kg. One ceiling exposure with extra reserve can support an optional first-set trial within the smaller of 10% or 5 kg; retain back-off rows and stop at intended reserve. These are exploratory targets, not predicted maxima.
- Never invent equipment increments. A coarse ceiling can prompt a small future rep-range extension. Raw machine-label trials require three observed neighboring-label transitions on the same setup. Added-bodyweight load selection remains manual. A failed comparable trial requires two new confirmed ceiling exposures before another suggested trial.
- Two confirmed misses can support a selected modest load reduction; repeated misses with local recovery flags can support one fewer local set. A cut plateau never justifies more volume.
- Adding one weekly set is an explicit experiment: at least four exposures across 14 days, repeated under-challenge, two favorable reported follow-ups, explicit priority, maintenance/gain context and time allowance. Limit one addition per seven days/bundle and at most 10% of total weekly sets. Missing context cannot justify additions.
- Substitutions require a reported equipment/fit issue or repeated misses, matching primary muscle/movement and available previously tolerated alternatives. Offer at most three; clear the old load/setup baseline. This is not rehabilitation advice.
- Repeated misses across a majority of recently trained muscles (at least two), plus systemic fatigue, can prompt deload review. Preview actual phase-dose targets; returning to accumulation requires explicit review.

These windows, tolerances and increment bounds are original conservative app policies, not experimentally established personal thresholds. Readiness, pump and soreness do not prove growth. This engine needs no live provider and does not enable public Gemini access.

## Durable evidence

Immutable decisions and outcomes use owner-scoped normalized storage and the same Worker/D1 compare-and-swap transaction as target changes. Pinned event pagination and transactional IndexedDB preserve consistency. Older clients that omit the ledger preserve it. Checksummed backup v3 carries events; v1/v2 imports remain supported.

Outcomes are **met**, **too demanding**, **easier**, **changed**, or **unknown**. Skipped exercises are not successes. History edits invalidate earlier comparisons; correction events retain the earlier record. Counts describe reported target attainment, not growth, safety, algorithm superiority or the causal effect of bundled changes. Manual overrides retain their provenance.

Existing personal programs and history are not bulk rewritten. Legacy/imported records remain usable without invented effort or prescription provenance. Storage has finite resource budgets; this is not a promise of unlimited free hosting.
