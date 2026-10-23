# Reviewed workout-preview guidance

The workout preview shows one primary existing coach-v1 recommendation per exercise: Keep, Add a rep, Review load, Establish baseline, or Recovery review. It uses the existing confirmed-performance and recovery gates. This is a deterministic offline feature, not a newly qualified AI provider or a claim of optimal growth.

Open Readiness to supply an optional current check-in. Missing readiness or historical effort does not become favorable evidence. Open Review targets to see current-to-proposed rows and a short reason; evidence and exclusions remain expandable.

## Explicit scope and saving

Queue targets stages a choice in the preview only. Today’s workout changes the forthcoming draft’s prescriptions. Future workouts only changes the routine while today keeps the originally previewed targets. Scope stays explicit. No device/cloud data changes until Start workout, which saves the draft, accepted decisions and any future targets together through the existing durable store. The logger opens after device durability or a cloud acknowledgement; cloud sync remains separately indicated.

Queued choices can be cleared. Reordering, adding/removing exercises or changing readiness clears staged advice and restores the original unaccepted rows before reevaluation. Program changes require a fresh preview. Evidence and acceptance are revalidated against current state at Start. An incoming active draft is preserved and can be resumed.

Actual effort stays unreported after accepting targets; target RIR is not an observation. Unknown imported effort remains unknown. Completed history is unchanged. The existing version 3 backup and owner-scoped coaching ledger carry saved decisions without a database migration.

Staged decision identities/timestamps remain stable while replaying the preview. Choices started together share a bundle label; their outcomes cannot establish each component’s causal effect. A future target remains pending until a confirmed comparable workout actually used that proposal’s assigned rows, rather than merely occurring after acceptance.

## Verification and remaining scope

Tests cover today/future scope, exact applied rows, immutable source state, stale history/readiness/program/draft rejection, stable decisions, coordinated bundles, unapplied future targets and unknown effort. Actual isolated Worker/D1 browser checks cover 360/390px and desktop; a staged offline start survives reload and then syncs its draft and ledger after reconnecting.

This release does not implement next-set adjustment, a longitudinal response model, comparable lift charts or scheduling. Those remain explicit steps in COACHING-ROADMAP.md.
