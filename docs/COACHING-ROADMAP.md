# Coaching implementation roadmap

Approved October 24, 2026. Preserve accounts, history, programs, compact logging and explicit acceptance. All training policies remain subordinate to TRAINING-PRINCIPLES.md. No live provider is required for this work.

## Release sequence

1. Correctness: isolate program targets from temporary substitutions; round-trip and recover coaching transaction manifests; atomically preserve an incoming draft; prevent accidental history submission; require timely independent recovery evidence for volume; rebuild prescriptions after explicit advanced-method conversion. A completed release requires actual Worker/D1 and browser evidence, GitHub push and the matching public SHA.
2. Preview guidance: compact Keep / Add rep / Review load / Establish baseline summaries, exact current-to-proposed rows, short reasons and expandable evidence. Reviewable today/future scope and stale-preview rejection. Optional next-set advice supports straight sets only, explicitly reported effort, conservative rest/load review and unfinished rows only.
3. Experiment review: derive valid follow-ups from the existing decision/outcome ledger. Recommend keep, review reversal, observe or reassess. Require two eligible follow-ups for ordinary keep/reversal reviews; pain/recovery vetoes remain immediate. Keep volume experiments distinct, with timely recovery evidence and unchanged existing escalation caps. Show uncertainty and sample counts, never causal growth claims. Reversals require explicit approval and matching current targets.
4. Comparable lift progress: separate setup, equipment, load convention, phase and method; show saved load/reps/reported RIR, context breaks and accepted changes. Unknown effort stays unknown. Preserve raw timelines separately.
5. Scheduling and short sessions: separate planned occurrences from completed work; deliberately move/skip/repeat within the existing workout sequence. Preview 30/45/60-minute alternatives without compressing rest, splitting linked groups or automatically adding catch-up volume. Record accepted dose changes and preserve the original plan reference.

## Shared acceptance

- Existing data and legacy backups remain readable. Version and negotiate new payloads before enabling writes that older strict clients cannot understand.
- Targets shown in previews must match accepted logger prescriptions. Actual edits, imports, substitutions, reordering, Undo and history corrections invalidate affected advice/comparisons.
- Use fresh explicitly reported observations; never infer RIR, recovery, diet phase, hypertrophy or personal volume landmarks from missing data or subjective feeling alone.
- Use synthetic tests and longitudinal scenarios, native IndexedDB, actual isolated Worker/D1, 360/390px and desktop flows, keyboard access, reduced motion, offline recovery and backup rehearsal.
- Publish reviewed releases to GitHub master and the existing Cloudflare app; verify the complete public release SHA and changed hosted flows with synthetic intercepted data. Separate incomplete provider/physical-device/automation verification from implemented behavior.

## Current status

Correctness release `991071ed9b4d853bddfa8bdf89c9fa2e4a197e34`, preview guidance release `7c63219c309bb0486c0c3132ef108373955ace0e` and accepted-change review release `775c8c946b9f32ef7aa69c52966b15fa698e896c` are on GitHub and verified on the existing Cloudflare app, including isolated hosted flows at 360/390px and desktop. Optional next-set advice and comparable lift progress are released as `cdfb3c6d3726b2598b885bb5f1555e6db593a64d` and verified on the live app; see LIFT-PROGRESS-AND-NEXT-SET.md. Scheduling and reviewed short-session alternatives complete the remaining implementation; see SCHEDULING-AND-SHORT-WORKOUTS.md. All five implementation stages are complete. Delivery of a release is verified against its matching GitHub commit and the full public SHA at `/__release.json`.
