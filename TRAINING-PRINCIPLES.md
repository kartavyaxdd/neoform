# NEOFORM training principles

Status: K's approved foundational source and implementation contract, adopted October 15, 2026. The book informs our training decisions and future app work; adoption does not mean the full coaching engine described below is already implemented.

## Source and evidence boundary

Primary source: Mike Israetel, James Hoffmann, Melissa Davis and Jared Feather, *Scientific Principles of Hypertrophy Training*, Renaissance Periodization (2020), K's local PDF.[1] Citations below use the actual PDF page numbers, not the inconsistent table-of-contents labels. The complete extracted text was reviewed in five non-overlapping ranges covering all377 pages; the parent additionally inspected the cover and graphical material on pp.97,99,107,144,244,257,278,326. Chapter notes and visual corrections are under `.planning/book-notes/`.

This is an original synthesis of the supplied book, not a reproduction, an independent replication of its studies, or a claim of current scientific consensus. The book combines published research, explanatory hypotheses and coaching heuristics. Its example set counts, ratios and timelines are not immutable physiological laws. NEOFORM's own conservative software limits must not be marketed as thresholds established by the book.

Source identity: SHA-256 `2e5c0c3ddb68ebe5a3a7b32032844a1742760bd84c673e8f41680bacc3a40ba8`;377 PDF pages. The source PDF remains in its original location and is not copied into the repository or uploaded to an AI provider.

## Seven ground rules

### 1. Specificity: the program serves K's actual goal

The book puts goal-relevant training before clever optimization: select work that develops the intended muscles/qualities or supports their later development. Determine priorities from the person's goals, preferences and constraints rather than a universal competitive physique ideal. Concurrent sports and other goals are legitimate trade-offs, not forbidden activities. (PDF pp.13–22,27–32,340.)[1]

NEOFORM rule: record the goal, priorities, schedule, equipment and tolerable movement constraints. Match exercises to those inputs. Cover complementary actions where feasible. Emphasizing one muscle must redistribute limited time/recovery rather than endlessly inflate total work. Do not claim complete coverage when the available exercise catalog cannot provide it.

### 2. Overload: progress the stimulus, not the ego

Overload means a sufficiently challenging stimulus; progressive overload means preserving that challenge as adaptation changes the requirement. Reps, load, sets and effort can all contribute. More weight every session is not mandatory. Comparable technique, ROM and target RIR matter when interpreting performance. The book's broad5–30-rep and0–5-RIR ranges are contextual, not an instruction to use every range or take everyone to failure. (PDF pp.37–39,55–63,89–106.)[1]

NEOFORM rule: keep prescribed and actual performance separate. Prefer repeatable technique and equipment-aware increments; do not manufacture machine-load equivalence. Offer hold/reps/load/set-review decisions with reasons. Never automatically add sets every week or force PRs. Beginner programming remains conservative: stable technique, modest complexity and no intentional failure; the book advises at least2 RIR for beginners. (PDF pp.315–317.)[1]

### 3. Fatigue management: recovery takes priority over escalation

The book distinguishes local, joint/connective-tissue, axial and systemic fatigue, and favors useful stimulus relative to recovery cost. Pump, soreness and perceived stimulus are imperfect context, not direct measures of growth. Declining comparable performance combined with incomplete recovery is more informative than tiredness alone. (PDF pp.83–99,132–156,175–182.)[1]

NEOFORM rule: missing feedback is UNKNOWN, not good recovery. Keep pain separate from ordinary muscle soreness and exertion. A local problem should not automatically deload unrelated muscles; broad deterioration merits a broader review. Do not diagnose MRV from one poor session, calculate a precise growth/SFR score, or tell K to work through joint pain. Preserve the performance veto on volume additions: easy recovery does not justify more sets when performance is already below its intended effort target. (PDF pp.98–99.)[1]

### 4. SRA: distribute work around recoverability

Stimulus, recovery and adaptation have related but nonidentical time courses. Recovering does not prove growth, and subjective recovery does not precisely reveal an anabolic window. Frequency changes the dose per session and recovery spacing; total gym days and each muscle's frequency are different quantities. (PDF pp.187–204,212–227.)[1]

NEOFORM rule: track actual muscle exposures and supporting-muscle overlap; propose spacing compatible with K's real schedule. Learn from repeated comparable exposures, not a universal48-hour growth countdown. Protect full rest days. Rest between sets is readiness-based: a timer is a convenience, not an order to begin while breathing or assisting muscles still limit performance. (PDF pp.68–71,107–113,217–224.)[1]

### 5. Variation: retain what works, change for a reason

The book favors directed and strategic variation, usually retaining productive exercises through accumulation. Change exercises for poor fit, persistent pain, deteriorating stimulus/cost, or evidenced stagnation—not random weekly novelty. New movements need practice before fair comparisons, except that pain is not a reason to persist. A small complementary menu avoids needlessly escalating volume. (PDF pp.233–247,258–267,306–307.)[1]

NEOFORM rule: preserve exercise identity and comparable execution context. Record the reason for substitutions. Keep useful movements across mesocycles where appropriate; do not regenerate the whole exercise menu merely because a calendar block ended. Advanced techniques remain explicit opt-ins with distinct logs, not silently equated to straight sets.

### 6. Phase potentiation: different phases have different jobs

Accumulation, short fatigue reduction, deload, maintenance/resensitization and active rest are not interchangeable. The book's multiweek resensitization model is distinct from an ordinary deload and includes uncertain mechanism/timing estimates. Its numerical loading distributions and block sequences are examples, not mandatory calendars. (PDF pp.165–174,269–295.)[1]

NEOFORM rule: state the phase goal. A scheduled deload is a planning default subject to response, not a diagnosis of personal recovery capacity. A real deload must reduce training stress, not simply rename the week. Offer localized recovery before unnecessary whole-program changes; require explicit approval for changed targets. Do not infer a diet phase or prescribe a cut/bulk without that context. Do not promise a biological sensitivity reset after a fixed number of days.

### 7. Individualization: reasonable defaults first, measured response next

The book applies the same principles differently according to training stage, anatomy, muscle response, diet, other activity and recovery conditions. Volume landmarks vary across time and context. Advanced athletes' routines, sex/age averages and speculative fiber-type arguments are not automatic prescriptions for another person. (PDF pp.298–334,348–375.)[1]

NEOFORM rule: start conservatively when history is absent and show uncertainty. Update recommendations from repeated comparable performance, muscle-specific recovery and user preferences. Never label a fixed table as K's measured MEV/MAV/MRV. Do not infer injury diagnosis, rehabilitation protocol or blood-flow-restriction prescription from this book; its own injury section defers to individualized medical care. (PDF pp.353–356.)[1]

## What this means for our training decisions

NEOFORM's proposed decision order—not a verbatim algorithm from the book—is:

1. Check goal, movement tolerance and technique comparability.
2. Check actual performance against prescribed load/reps/RIR, using all relevant sets rather than a cherry-picked PR.
3. Check muscle-specific recovery, supporting structures and broader fatigue. Missing observations remain unknown.
4. Choose the smallest justified action: repeat/hold, add reps, adjust an available load increment, review a small volume change, use localized recovery, or review a deload.
5. Explain the evidence, uncertainty and expected next check; let K accept, edit or decline.
6. Review at mesocycle end: retain productive exercises, investigate repeated problems and deliberately plan the next phase.

This decision flow requires more response data than the current app possesses. It is not permission to infer personal training history or silently alter existing workouts.

## Historical gap analysis and build order

The following inventory describes the pre-engine baseline, not the current release; resolved behavior is listed in the implementation section below. Original inspection: `.planning/TRAINING-ENGINE-BASELINE.md`.

A. Effort consistency: `weeklyTarget()` displays a calendar RIR schedule, but `createEntry()` uses each exercise's stored target except in deload. Align the actual logger with the shown target before claiming phase-aware coaching.

B. Honest feedback: default pump/soreness/fatigue values currently look like observations. Add optional/unknown and muscle-specific observations, with safe backward compatibility for old records. Distinguish pain, soreness, joint response and systemic fatigue.

C. Transparent exposure: current volume credits only one catalog muscle per exercise and counts RIR<=4 sets. Make direct/indirect involvement and effort qualification explicit estimates, not perfect growth doses; keep warmups excluded and avoid double counting. Advanced-technique credits must remain declared heuristics.

D. Response-based coaching: add explainable hold/progression/volume-review/recovery decisions backed by multiple comparable exposures. Missing data, equipment changes and stale reports must prevent confident escalation. Keep the existing conservative progression cap until a tested alternative is justified.

E. Real phase execution: distinguish localized recovery and deload/resensitization. Actual set/rep/load/effort reductions must be visible and testable; scheduled week labels alone are insufficient.

F. Program generation: construct a conservative starting plan within equipment/time/schema constraints; include this versioned principle guidance in the actual provider request. A valid JSON response is not proof of individualized coaching. Muscle-specific response and long-term scheduling need deterministic evaluation beyond prompt text.

G. UI: preserve the approved compact MacroFactor Workouts-inspired logger. Put feedback and recommendation explanations into brief finish flows/sheets; do not rebuild a crowded dashboard.

## Implemented training release and remaining limits

The initial prompt-only adoption is superseded by the executable training release. Current verification and review closure are recorded in `evidence/training-engine/RELEASE-VERIFIED.md`; historical owner/review reports remain for traceability.

Implemented:
- `src/domain.ts`: unknown/unreported feedback, muscle-specific recovery and performance reviews with evidence/source pages, declared-phase workout preparation, explicit effort ramps, conservative beginner reserve, executable deload/maintenance/resensitization doses and active-rest handling.
- `src/TrainingFeedback.tsx` / App: optional per-muscle finish feedback, explicit future-only phase/effort controls, actual-dose previews and explainable reviews. Old records remain valid; new session snapshots retain their phase.
- `src/techniques.ts`, `TechniqueSheet.tsx`, compact logger: manual opt-in straight/down sets, non-overlapping supersets, pre-exhaust pairs, myorep activation/mini bouts, drop sequences, giant-set total-rep goals, controlled tempo/pauses. Raw execution/groups/rest survive save/reload; advanced methods do not inherit straight-set automatic progression.
- `muscleExposure` / `directVolume`: direct and indirect hard-set estimates, advanced raw bouts, raw counts and session exposures are distinct. Advanced bouts are not converted into fractional growth credits or added to direct straight-set totals.
- Records retain semantic method/bout/phase context; pairing instance IDs are distinct from stable partner/order protocols. Performance visualizations are explicitly raw-bout timelines with matching load/rep observations, not mixed-context strength trends.
- Review corrections: newer unknown observations cannot clear unresolved systemic fatigue; old high fatigue requires current confirmation rather than diagnosing persistent fatigue. Missing historical prescriptions hold escalation. Known/ambiguous legacy deloads cannot repeatedly halve a previous reduced load; uncertain reference loads remain manual. New phase provenance is stored without rewriting historical sessions.
- Actual bounded Gemini requests retain seven-principle guidance and deterministic output validation/audits. AI supports straight sets by default and explicit eligible tempo opt-in only; complex methods remain manual logger features. Preview audits surface coverage, complementary actions, frequency, time-budget assumptions and unknown personal volume landmarks.

Not claimed:
- Measured MV/MEV/MAV/MRV, growth diagnostics, inferred fiber type, complete sport/diet/illness or axial-fatigue sensing, automatic individualized volume escalation, or automated whole-sequence advanced-technique progression.
- BFR/occlusion instructions, self-rehabilitation or forced-failure prescriptions.
- Fresh live Gemini qualification: synthetic upstream and clearly labelled genuine-output transport replay verify boundaries/UI, not current owner-provider availability.
- Automatic edits to K's existing program, completed workouts or private records.

Original software defaults—including readiness/review windows, phase-dose recipes, conservative load increments and beginner restrictions—are disclosed app policies informed by the book, not independently validated physiological thresholds.

Current generator limits—5–20 reps,2–4 RIR,45–180-second initial rest targets,1–4 sets per exercise,4–8 weeks and final-week deload—remain conservative software bounds, not the full range of the book. Rest can be extended in use; the app must not imply that its time/volume budgets are precise physiological limits.

## Acceptance gates for subsequent training-engine work

October 21 substitutions/program review: `docs/SUBSTITUTIONS-AND-PROGRAM-REVIEW.md` defines the explicit session-only substitution and descriptive program-review policies. They preserve completed observations and separate load histories, reuse existing coaching eligibility, and require approval for future targets. Three comparable exposures, a 21-day freshness limit and a 14-day flat-performance flag are original app heuristics, not measured individual growth or plateau thresholds. No automatic rotation or personal-program rewrite is introduced.

October 19 correctness work (policy `neoform-book-2026-10-v2`): new set effort stays unconfirmed until explicitly reported or confirmed at finish; positive coaching requires reported effort and known completed planned dose. Legacy records remain unchanged and cannot establish those missing observations. Actual workout identity, explicit dose revision, phase-transition baselines, full current prescription matching, row-specific progression and manual machine-label changes strengthen the logger/coaching boundary. These remain conservative software policies, not a measured personal response model.

Equipment work (policy `neoform-book-2026-10-v3`): explicitly selected available loads replace hypothetical numeric increments. Pick the smallest selected increase within the smaller of 2.5% or 2.5 kg; hold when inventory is unknown, too coarse, or excludes the baseline load. Machine labels and added-bodyweight progression remain manual. Setup name and execution notes distinguish comparable performance and visible records; inventory changes do not by themselves change execution identity. Session snapshots and future program settings change only by explicit save; changing a program exercise clears its old setup. Display-unit changes do not round untouched canonical inventory. These are original conservative software choices. Longitudinal response learning, readiness and durable lifetime history remain outstanding in `docs/IMPROVEMENT-PLAN.md`.

October 20 readiness work (policy `neoform-book-2026-10-v4`): positive progression guidance requires an explicitly affirmed current pre-session check-in, usual context, pain-free reports, low systemic fatigue, and recovered primary muscle with low soreness. Both general and applicable muscle observations must be within the app's 12-hour window and follow the latest exposure. This freshness limit is an original software policy, not an SRA clock. A check-in is optional for logging and never changes targets by itself. Whole-workout muscles are available in the same sheet; observations become read-only once working sets begin. Finish feedback stays separate. Updating general context does not refresh muscle observations outside the reviewed workout.

Historical pre-session pain and post-workout observations remain separate chronological evidence. Unknown recovery, soreness or fatigue cannot clear a prior actual local flag; explicit newer observations can, without editing history. Future favorable reports cannot clear current warnings. Pain and assisting-muscle flags veto escalation within their scope. Changed sleep/illness/travel/activity context is reported context, not a causal diagnosis. Optional volume review additionally requires repeated favorable performance and reported recovery; neither current readiness nor pump/soreness alone establishes a need for more sets or measured growth. Longitudinal response modeling and durable lifetime history remain open.

- Every recommendation includes its evidence, assumptions, policy version and source linkage.
- Unknown feedback cannot become evidence of excellent recovery; old records migrate without invented observations.
- Pain/declining performance veto escalation; local fatigue does not automatically apply to every muscle.
- Displayed targets equal actual logger targets, including deload behavior.
- Volume summaries distinguish completed work, planned work, muscle involvement and uncertain credits.
- Program edits are explicit preview/accept operations, never silent rewrites of training history.
- Tests cover missing data, beginner effort, missed sessions, insufficient equipment, machine labels, coarse increments, fatigue vs plateau and deload vs resensitization.
- Real isolated Worker/API and360/390px browser checks supplement unit tests; personal state remains untouched by QA.

## October 20 confirmed-performance coaching

`coach-v1` adds immutable per-set prescriptions, explicit execution/rest confirmation, preview-and-accept session or future-program choices, bounded progression trials, local dose/substitution and broad deload reviews, and a durable decision/outcome ledger. Exact original policy bounds and limits are in `docs/COACHING-ENGINE.md`; these supersede the older hold-only coarse-step policy where an explicitly reviewed trial or rep-range proposal qualifies. Pain vetoes, unknown observations and phase boundaries remain. This does not establish longitudinal growth prediction or algorithmic optimality.

October 25 accepted-change review: `docs/ACCEPTED-CHANGE-REVIEWS.md` defines derived follow-up reviews and conservative response guards. Two confirmed target attainments support keeping an experiment; two misses prompt a reviewed prior-target option where a still-current isolated restoration is supported. Missing observations, changed context and stale/corrected outcomes cannot establish success. Volume needs distinct timely recovery follow-ups in addition to performance. These are original software heuristics, not measured growth, optimal targets or personal volume landmarks. All changes still require explicit scope and acceptance; no automatic escalation caps are raised.

## Sources

[1] file:///C:/Users/spamk/OneDrive/Documents/Fitness/Mike%20Istraetel/Dr.%20Mike%20Israetel,%20Dr.%20James%20Hoffman,%20Dr.%20Melissa%20Davis,%20Jared%20Feather%20-%20Scientific%20Principles%20of%20Hypertrophy%20Training-Renaissance%20Periodisation%20(2020).pdf — Scientific Principles of Hypertrophy Training (2020), user-provided local PDF
