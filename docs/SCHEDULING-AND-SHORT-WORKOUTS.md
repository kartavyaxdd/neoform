# Deliberate scheduling and shorter workouts

This release completes the fourth approved product improvement. Calendar plans are separate occurrences; saved workouts remain the source of completed training. Nothing automatically increases volume, catches up missed sessions, advances a program week, or changes a saved routine.

## Calendar

Workout → Plan workouts accepts a routine and an explicit date. Move preserves the occurrence and original date. Skip keeps the record. Repeat creates a new occurrence; a saved workout cannot count twice. Logged means a session was saved, not successful completion of every target. An active or saved assignment cannot move or skip. Actual workout dates remain actual dates even when training early or late. Routine names on plans are snapshots; previews always use the current saved routine and validate it again at durable start.

At least one unplanned day is retained in each affected rolling seven-day window, accounting for completed working training and uncompleted plans. This is an original conservative app planning policy, not a measured recovery threshold. Readiness remains an optional explicit review; calendar spacing never proves recovery.

## Shorter alternatives

Preview → Review shorter workout offers 30/45/60 minutes. It removes complete exercise groups from the end in the existing routine order, preserving retained IDs, prescriptions, rests, warmups, sequence and advanced bouts. It shows retained/omitted exercises and requires Use reviewed plan. If even the first complete group exceeds the budget, acceptance is unavailable. Restore full workout returns the original intended dose; changing budgets uses that original rather than repeatedly trimming the previous alternative.

Queue or accepted-target changes clear the time-budget claim with a notice and require fresh review. No omitted volume is placed elsewhere. The acceptance snapshot retains the original unlogged entries, retained IDs, estimates and calibration references. Actual logging and history correction never overwrite the snapshot. Finish review and the workout recap expose it under Reviewed workout plan.

Timing assumptions: 5–7 minutes general warmup, 1.5–2 minutes per exercise transition, assigned rests, assigned tempo or 3 seconds per rep, and 25% extra rest in the upper estimate. Gym queues and preparation can exceed the estimate. At least three of the last five recent matching complete workout durations with explicitly consistent execution/usual rest can calibrate the estimate. Context, order and intended row dose must match; future, incomplete and outlying durations are excluded. Calibration never shortens the base estimate or rests. These are disclosed planning assumptions, not physiological predictions or deadlines.

## Persistence and compatibility

Planning activates optional minimumClientVersion 2, calendar metadata and session schedule/short-plan fields; legacy records are unchanged. The store advertises X-Neoform-Client: 2. Old readers/writers receive 426 once an account requires planning support; local pending work is retained for upgrade. The marker cannot be downgraded through ordinary edits or old-backup restoration. Direct and staged writes are checked. D1 checks unchanged saved assignments as well as changed records, preventing a calendar move from silently relabelling history. No database migration or access-mode change is needed.

New planning exports use checksummed streaming backup version 4. Formats 1/2/3 remain readable; planning payloads cannot masquerade as those formats. Original snapshots preserve custom exercise references separately from actual observations. Independent calendar additions merge; competing date moves require an explicit conflict choice.

## Verification

Unit regressions cover date/identity/rest-day policies, linked groups, infeasibility, unchanged targets, calibration, capability negotiation, backup round-trips, merge conflicts and stale start rejection. Actual isolated Worker/D1 and browser release gates cover account boundaries, old-client rejection, staged writes, saved assignment conflicts, keyboard planning, 360/390px and desktop layouts, offline resume and start → log → review → save. Hosted synthetic flows verify the same release without reading or writing personal workout data.

Local release gates passed: 544 unit tests across 73 files; TypeScript and security checks; private Worker/D1 API24 and browser74; final focused rebuild API24 and planning4; public API2/browser42; separate-profile API1/browser3. Tests include first-use capability upgrade, original-only custom references, conflicting/duplicate assignments, shorter-plan revalidation, dark mode, keyboard actions, device persistence and backup restoration. Public release identity and hosted synthetic flows are checked separately after deployment.
