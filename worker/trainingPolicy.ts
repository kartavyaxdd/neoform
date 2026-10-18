// Original NEOFORM policy, informed by Scientific Principles of Hypertrophy
// Training (2020). Page references and implementation limits are maintained in
// TRAINING-PRINCIPLES.md. This is model guidance, not a physiological diagnosis
// or a deterministic history-aware coaching engine. No source book text copied.
import type { GenerationInput } from "../src/generation";

export const HYPERTROPHY_POLICY_VERSION = "v1";

export function hypertrophyInstruction(
  experience: GenerationInput["experience"],
  technique: GenerationInput["technique"] = "straight",
): string {
  const principles = [
    `NEOFORM hypertrophy policy ${HYPERTROPHY_POLICY_VERSION}. Use these principles within the output schema and software safety limits below. This is a conservative STARTING program, not a personalized volume-landmark assessment.`,
    "Specificity: Match the stated goal, available equipment, experience, time, limitations and muscle priority. For a hypertrophy goal select target-relevant, controllable movements with useful tolerable range of motion. Cover complementary muscle actions when the catalog/equipment permits; do not add unavailable exercises or pretend incomplete coverage is complete. A priority is a resource allocation, not permission to add unlimited work.",
    "Overload: Start with modest recoverable working-set volume and stable technique. Progress can be reps, load, sets or relative effort, not an obligatory personal record each session. Changes require comparable technique and actual performance at the intended RIR. Do not prescribe automatic weekly set additions, fixed load jumps, or failure as a requirement. Exercise-specific rep ranges should fit the movement and remain interpretable.",
    "Fatigue management: Recovery takes priority over progression. Favor useful target-muscle stimulus with manageable local, joint, axial and systemic fatigue. Do not infer growth from pump or soreness, or treat pain as ordinary effort. Repeated underperformance plus incomplete recovery supports review/reduction, not more volume. Missing history is unknown: do not invent recovery ratings, past performance, MEV, MAV, MRV, SFR scores or injury diagnoses.",
    "SRA: Distribute muscle work over the available sessions with recovery spacing and whole rest days. Per-muscle frequency is not the same as total training days. Avoid stacking demanding overlapping muscle/supporting-muscle work without recovery. Rest targets are adjustable starting suggestions: breathing, assisting muscles and the target muscle must be ready for another productive set, not forced to obey a countdown.",
    "Variation: Use a small stable, complementary exercise menu, predominantly straight sets. More exercises are not automatically better. Retain productive, tolerable movements across the accumulation; suggest replacements for persistent pain, poor fit or an evidenced plateau, not random weekly novelty. No rehabilitation/blood-flow-restriction protocols. Advanced methods require explicit preference and the bounded technique contract below.",
    "Phase potentiation: Distinguish accumulation, a fatigue-reducing deload, longer maintenance/resensitization and active rest. The schema's scheduled final-week deload is a software planning default, not a measured personal recovery deadline or a resensitization guarantee. Do not prescribe a diet phase, assume calorie surplus/deficit, or force advanced block sequencing without that context.",
    "Individualization: Population ranges are editable starting points, not personal physiological thresholds. Learn from repeated comparable performance and muscle-specific recovery when that data exists; it is not provided in this request. Avoid sex/age stereotypes, inferred fiber types, growth promises and false precision. State a compact starting-plan rationale and relevant uncertainty in the description; do not claim the app measured adaptation.",
  ];
  if (experience === "New")
    principles.push(
      "Beginner: Prioritize repeatable technique, simple whole-body coverage and a modest exercise pool. Keep at least 2 RIR, no intentional failure, and no advanced specialization. Never trade technique for a load increase. Do not assume a beginner can accurately estimate exact RIR.",
    );
  else
    principles.push(
      "Experienced lifter: Use the stated experience as context, not proof of recovery capacity. Do not force failure or high volume because the user chose Intermediate or Advanced. Keep the conservative schema bounds and require later evidence before escalation.",
    );
  principles.push(
    "Source linkage: Scientific Principles of Hypertrophy Training (2020), physical PDF pp.13–32 (specificity), 89–113 (overload/readiness), 187–224 (frequency), 243–257 (variation/method fit), 298–334 (individualization). Source-informed starting choices, not measured personal physiology. Put priority work early and redistribute finite sets; prefer complementary actions over redundant variants. The preview's deterministic audit checks coverage and assumptions separately from your description.",
    "Technique contract: down-set, superset, pre-exhaust, myoreps, drop-set and giant-set are manual-only. Never encode them in prose while emitting straight targets; do not invent pairings, load reductions, rep-goal or activation/mini-bout prescriptions. No forced failure or physiological set-equivalence credits.",
    technique === "tempo" && experience !== "New"
      ? "With explicit tempo opt-in, you MAY use tempo on selected movements, or retain straight sets if unnecessary. Each tempo target must include technique:'tempo' and tempo:{eccentric:1..5,pause:0..2,concentric:1..3} seconds. Use repeatable productive cadence, not maximal slowness or a claim of superior growth. Never prescribe tempo when a movement limitation is declared. These cadence limits are editable software choices."
      : "No explicit eligible tempo opt-in: straight sets only, technique omitted or 'straight', tempo omitted. Beginner generation always remains straight sets.",
  );
  return principles.join("\n");
}
