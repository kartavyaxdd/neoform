# Comparable lift progress and optional next-set advice

## Lift progress

Open **Levels → Detailed training insights → Compare this lift**, or **Info → Lift progress** inside the logger. The screen derives saved observations without editing history, programs, targets or effort.

Each contiguous context segment preserves exercise, equipment, load convention, named setup/execution, method, phase, intended dose, workout/source target and preceding exercise order. Returning to an earlier setup after a changed exposure starts a separate segment. Added-bodyweight comparisons require a timely reported bodyweight reference and keep different reported bodyweights separate; no added-to-total resistance conversion is invented.

Choose an actual load, set position and explicitly reported RIR. The chart shows up to twelve matching saved rep observations with keyboard-accessible selection and exact load/reps/effort together. It does not collapse these into a strength score or infer growth. Lines stop across missing or excluded observations. One observation is a baseline, not a trend.

Comparable points require known phase, complete planned straight working dose and timely explicit consistent-execution/usual-rest confirmation. Pain reports, advanced/mixed methods, partial doses and unconfirmed contexts remain in the raw observations rather than becoming favorable trend points. Unknown effort stays **—**; selecting unreported effort shows the raw observations, not invented matched-effort progress. Warmups and future sessions are excluded. Saved prescriptions and accepted-change annotations remain distinguishable from actuals. History corrections, Undo and imports are reflected by deriving the view anew.

## Next-set advice

During an exercise, the existing **Progression** icon opens next-set advice once a working set is complete and another remains. Before work starts it retains the next-workout review. The sheet offers links to Targets and next-workout review; the compact logger gains no additional toolbar controls.

Advice is read-only. It never changes prescribed rows, actuals, set count or the future routine. A checkbox can explicitly attest usual rest and consistent execution for the last completed set **for this review only**. It does not persist a whole-session execution report, confirm later sets, fill in RIR or become longitudinal coaching evidence. Changing the underlying entry/readiness invalidates that ephemeral check.

The deterministic order is:

1. Respect applicable reported pain/recovery vetoes, including unsaved draft pain reports.
2. Keep advanced/linked sequences, unknown/recovery phases, neck loading, out-of-order work, changed dose and inconsistent prescriptions under manual review.
3. While a matching deadline-based rest timer is active or paused, review rest first. Its expiration refreshes the open sheet; it is never an order to begin.
4. Require actual reported effort, unchanged assigned/actual loads and the explicit current rest/execution check before any numeric suggestion.
5. When the lower rep bound and intended reserve are met, keep the next assigned row. An easier set never automatically adds reps, weight or sets.
6. If a lighter back-off is already planned, keep that reviewed back-off rather than stacking another reduction from one miss.
7. After a lower-bound/reserve miss under the reported usual context, optionally review the next available selected load below both the performed and next planned load, within the smaller of 10% or 5 kg. If inventory is unknown/coarse or the load convention is machine-label/added-bodyweight, numeric adjustment remains manual.

These caps and review rules are original cautious software heuristics, not measured fatigue, predicted optimal targets or a diagnosis. Keep the planned rep range and intended reserve; manually reviewing Targets is a separate explicit action. Optional advice supplies neither automatic progression nor a second training ledger.

## Compatibility and verification

No new persisted fields, database migration, provider calls or backup versions are introduced. Existing accounts, drafts, programs and saved observations retain their formats. Tests cover matching context, segment boundaries, known/unknown effort, actual row/load filtering, corrections, pain, phase/method/dose/order exclusions, deadline rest, inventory bounds and preserved back-offs. Real isolated Worker/D1 browser checks cover 360px, 390px and desktop, explicit RIR, unchanged prescriptions, keyboard/focus access, dark/reduced-motion rendering and offline progress viewing. Hosted verification uses synthetic intercepted training state with actual release assets.
