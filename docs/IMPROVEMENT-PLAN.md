# NEOFORM improvement and acceptance plan

This is the continuation plan for K's full goal: fix the audited application, strengthen progression and individual response learning, and connect coaching to workout logging. A foundation release is not completion of that goal or a claim to be the best app in the world. No algorithm can directly measure hypertrophy, recovery capacity or personal volume landmarks from subjective logs alone.

## Non-negotiable boundaries

- Preserve personal accounts, programs and history. QA data only under `.qa-state`; no inspection of secrets, personal sessions, keys or password records.
- Follow `TRAINING-PRINCIPLES.md`. Distinguish evidence, assumptions and software policy. No fabricated biological precision or automatic personal-program rewrites.
- Preserve the compact 360/390px logger. Put planning, readiness and explanations in sheets or short finish/review flows.
- Every major release requires GitHub production-branch push and the same full SHA verified on the existing public app. Preserve the exact database, encryption master and selected public-workspace access mode.
- At each completion candidate, three independent agents review and debate correctness, remaining scope and publication readiness. Their blockers must be resolved and verified; test counts alone are insufficient.

## Foundation release verified

Implement and test audit B01–B09: stale-journal replay, explicit saves, stable program activation, prescribed versus completed dose, phase/context isolation, raw machine labels, per-row progression, confirmed effort and workout identity. Include changed-dose acceptance and prescription-aware Insights.

Journal receipts must survive reload and explicit conflict resolution. Never delete another live tab's mutable localStorage journal with a non-atomic read/remove operation. Until transactional storage is introduced, retain those foreign journals and suppress consumed generations with receipts.

Actual effort is separately confirmed. Legacy records keep their original numbers and unknown provenance; positive coaching cannot treat those as freshly reported observations. New unconfirmed effort is excluded from hard-set estimates. Program/session schemas add optional metadata without inventing historical values.

Required evidence: regression failures before fixes, passing full core/typecheck/build/security checks, actual isolated Worker/D1 data roundtrip, explicit-save/activation and offline-reload browser checks, per-row recommendation acceptance, confirmation provenance, 360/390px layout inspection, reviewer closure, GitHub and public-release verification.

Foundation release `99fccc79cec8a9c54039dd62592611d3f437fa2a` is on GitHub master and was verified on the public app through `/__release.json`, health, intended public-workspace identity and a synthetic intercepted-data mobile browser flow. GitHub code checks passed; its remote database/master preflight failed and skipped deployment. The authorized manual path deployed the same committed release with exact database and existing encryption-master metadata verified. Automated remote preflight repair remains open; no secret values were inspected or rotated.

## Equipment release verified

Explicit per-session setup/ROM notes and available load lists, optional deliberate save/clear for the original workout target, setup-separated visible records, and conservative attainable load proposals are implemented. No mass updates of history or program settings occur. Setup changes after recorded working sets are locked for that session; exercise replacement clears its template setup. Unit-switch resaves preserve untouched canonical inventory. All three independent reviewers cleared the corrected focused candidate, conditional on final verification and publication. Lifetime storage, readiness and the broader response model remain open.

Release `4eea357c1ad667cc2b6c103ffdcd2862acb20a13` was pushed to GitHub master and manually deployed to the existing Cloudflare application after successful exact-target/database/master-metadata preflight. The public full SHA, health and public-workspace boundary matched. A real hosted browser check exercised equipment setup/program save and 360/390px logging with synthetic intercepted client data only. GitHub code checks passed; its database/master preflight still failed, so automated deployment remains unrepaired.

Candidate validation: 277 core tests, typecheck, build and AI boundary check passed. Eight real isolated Worker/D1 API checks passed, including exact equipment/source-target roundtrip. Fourteen browser checks passed, including 360/390px equipment sheets, both unit-switch directions, explicit program clearing, exercise replacement with historical preservation, existing offline sync and phase/logger/accessibility flows. Regression failures were observed before the inventory/context/roundtrip fixes; setup-separated record text and unavailable-baseline holds are covered. Generated evidence and test accounts stay isolated from personal data.

## Readiness release candidate

Current pre-session check-ins are separate optional snapshots, with explicit affirmation, individual muscle times, whole-workout access, and read-only preservation once work starts. Positive progression requires fresh current evidence; post-workout feedback cannot impersonate today's readiness. Historical flags resolve from actual per-field observations; unknown assisting-muscle reports cannot erase a warning, and future favorable feedback cannot hide current pain/fatigue. Sleep/illness/travel/activity changes hold escalation for review without claiming causation. All three reviewers cleared corrected code, conditional on final API/browser/public verification. Remaining full-goal items below stay open.

Candidate verification: 289 core tests including 12 readiness scenarios passed, along with typecheck, build and AI boundary checks. Eight actual isolated Worker/D1 API checks passed with mixed-age readiness roundtrips. Seventeen browser checks passed: 360/390px readiness/context/advice flow, explicit affirmation, other workout muscles, immutable completion, per-row age display, and the existing equipment/sync/phase/accessibility/layout flows. Reviewer-found assisting-unknown and future-feedback defects had failing regressions before correction. Public release verification is the final gate for this candidate.

## Remaining full-goal work

1. **Trustworthy durable persistence:** move account history out of a single 2 MB row; normalized, paginated sessions and transactional revisions. Introduce IndexedDB outbox and coordinated journal garbage collection. Migration must preserve every existing record, support compatible rollout and restore rehearsal, and avoid querying personal data during development.
2. **Equipment and execution context:** explicit setup identity, execution notes and available-load proposals are implemented in the equipment candidate. Remaining: substitution reasons and reusable equipment-profile management beyond individual workout targets. Available increments must fit conservative progression caps or yield hold; raw labels remain manual.
3. **Pre-session readiness:** implemented in the readiness candidate with current muscle recovery, pain, systemic/local fatigue, soreness and broader context. Missing reports remain unknown; checks are separate from immediate finish feedback, never a recovery countdown or injury diagnosis. Final candidate verification/publication is still required.
4. **Individual response model:** learn from repeated confirmed, comparable exposures and follow-up recovery with transparent sample counts and uncertainty. Separate performance changes from adherence, changed equipment/rest, technique practice, illness/travel and phase effects. Evaluate holds, regression, plateau, reacclimation and recovery scenarios before offering dose changes. Never infer growth from pump/soreness.
5. **Scheduling:** explicit workout sequence and actual weekdays, rest-day protection, deliberate repeat/skip/reschedule, and short-session alternatives. Preview redistributed work and overlapping muscle exposure; no automatic catch-up volume.
6. **Auditable coaching transactions:** persist recommendation inputs/references, policy version, evidence, uncertainty, proposal, acceptance/edit/decline and subsequent outcomes. Keep advice and actual logging interconnected without automatically changing programs.
7. **Program quality and AI integration:** deterministic feasibility checks for actual time, equipment, stated goals, complementary actions and spacing. Use opt-in bounded training summaries rather than private raw history by default. No static fallback marketed as live AI; preserve safe deterministic coaching without provider access. Public-workspace AI remains disabled until an explicitly authorized access/product decision.
8. **Weekly and mesocycle review:** summarize confirmed trends, dose/adherence and recovery; retain productive movements; offer the smallest justified future change with approval. Add pre-defined synthetic evaluation scenarios and longitudinal simulations; do not claim measured MEV/MRV or guaranteed optimal growth.
9. **Free-hosting efficiency and operations:** revision-only checks, hidden-tab backoff, direct static-asset serving with preserved headers, sanitized operational metrics and budget visibility, private backup/restore procedures. No purchases or billing changes.
10. **Product completion and release gates:** meaningful API and 360/390px browser checks in CI; portable QA configuration; modularize large components; remove stale instructions; account recovery/auth work where needed; logger undo and wake-lock ergonomics. Keep optional measurements private and clearly separate observations from causation claims.

The missing book URL has not been supplied. Existing approved book identity and principles remain authoritative; a new source must be read and reconciled before new claims or prescriptions are attributed to it.

## First independent debate

All three initial reviewers rejected the first candidate. They identified conflict-receipt loss, unsafe cross-tab journal deletion, phase-transition bridging, phase-blind volume reviews, unconfirmed target effort used as actual evidence, current-prescription mismatch and missing changed-dose acceptance. These are being addressed with executable regressions. Full adaptive-coaching and lifetime-storage completion remains unproven.

Three review rounds found and corrected additional already-open-third-tab replay, local/merge receipt-review loops, historical intended-effort mixing and inconsistent Insights targets. All three final reviewers cleared the foundation candidate for release, conditional on deployment verification. Final local validation: 267 core tests, typecheck, build and AI boundary check passed; eight real isolated Worker/D1 API checks and eleven selected browser checks passed, including 360/390px layouts and explicit dose/effort confirmation. The Unicode near-limit import test now builds its synthetic fixture in linear time while still checking exact UTF-8 bytes. These results do not establish the remaining response-learning/storage features or live provider qualification.
