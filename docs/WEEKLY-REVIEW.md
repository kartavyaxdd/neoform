# Weekly review and logging polish

Open Dashboard → Weekly review. This is a read-only summary, not a program editor or a diagnosis of training response.

The week selector uses local Monday–Sunday dates. Completed saved workouts are included; active drafts and future-dated observations are excluded. An unfinished exercise means fewer completed working sets than its recorded planned count, not an instruction to make up work. Entirely removed exercises cannot be reconstructed from completed history.

Assigned-set attainment uses the immutable row prescription, reported effort and confirmed consistent execution/usual rest. Different actual loads are labelled changed. Lower reps or reserve more than one RIR below the prescription are below target; reserve more than one above is easier; otherwise targets are met. Missing prescriptions, effort or execution context stay unknown. This is the existing coaching outcome tolerance applied to individual completed straight working sets, not a new progression policy. Advanced bouts remain outside this summary.

Lift comparisons use the immediately preceding exposure in the same program/workout/target stream. They require the same coaching context, planned/completed set count, row loads, assigned load/range/RIR/rest context and explicitly reported actual RIR. Assigned rep counts can differ when progressing within that unchanged range. Missing prescriptions, changed setup, phase, order, incomplete dose, changed rest or unconfirmed observations prevent a comparison; intervening records are never silently skipped. Reps gained/lost are observations, not proof of strength, hypertrophy or the effect of coaching.

Coaching follow-through uses the latest recorded outcome per accepted/edited proposal and workout. Existing immutable outcome fingerprints invalidate edited history. An invalid outcome is marked for reassessment, not counted as success. The review creates no events and changes no history, plans or prescriptions.

Logger numeric fields select their contents on focus. Enter advances load → reps → RIR → completion control without logging a set. Completion still requires explicit activation. The visible RIR remains blank until reported. Numeric text is at least 16px to avoid mobile focus zoom. Rest follows the completed row's saved prescription, with the exercise target as a legacy fallback; differing row rest is displayed. The timer distinguishes paused and finished states and never commands starting a set.

Verification combines synthetic multi-session replay, immutable-state assertions, real isolated Worker/D1 tests, keyboard/full-session browser runs at 360/390px and desktop, offline review/backup checks and isolated hosted UI checks. Browser emulation does not establish comfort with a physical phone keyboard or replace feedback from actual gym sessions. No personal workout history is used as QA data.
