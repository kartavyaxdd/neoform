# Live next-set guidance and reviewed swaps

The compact workout logger now continuously derives the next-set review from the
active draft. A small control below the set rows shows the current action and
the next row's assigned load, rep range and RIR. It opens the existing detailed
review; explanations stay out of the set table. Completion, corrections, Undo,
order changes and timer expiry update the same review. It works on-device and
does not call Gemini or wait for cloud sync.

This exposes the existing conservative next-set policy, not a new growth or
fatigue model. Confirm actual effort and, for a numeric load review, explicitly
confirm usual rest and consistent execution for the current review. That
confirmation stays in memory and is invalidated by changed performance/context;
it never fills in other observations or survives as a workout-wide assertion.
An easier set does not prompt a mid-workout load increase. A range/reserve miss
can suggest an available selected smaller load, within the existing conservative
bound. Unknown inventory, changed actual loads, advanced/linked methods, recovery
concerns and unsupported phases retain their manual/review gates. No advice
automatically changes set counts, prescriptions, actual inputs or future programs.

Manual substitution previously rejected applicable recovery concerns only after
the user pressed Apply. It now displays the warning before the action. The user
can explicitly acknowledge a manual exercise choice, bound to the chosen
alternative and report context. A changed warning requires another review.
Acknowledging is not an assertion of recovery or pain-free movement, and does
not clear readiness/history or permit coaching escalation. Original pain-skip
context remains a caution on the replacement. Completed observations stay
unchanged, replacement loads start unset and actual effort stays unknown.
Stale previews and linked/advanced editing safeguards remain in force.

No persistence schema, provider access, database migration or reward policy
changes are introduced. Synthetic tests cover the reported Arms and Shoulders
Y-raise-to-dumbbell-raise case, review invalidation, completed-set preservation,
offline resume and live set-by-set advice at 360, 390 and desktop sizes.
