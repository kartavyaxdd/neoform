import * as D from "./domain";
import type { weeklyMuscles } from "./weeklyMuscles";
import { Button } from "./ui";
import { ComparisonBars } from "./MetricChart";
export function WeeklyMuscleCards({
  review,
  active,
  openTargets,
}: {
  review: ReturnType<typeof weeklyMuscles>;
  active: boolean;
  openTargets?: (session: D.Session, entryId: string) => void;
}) {
  const calendar = review.calendar;
  return (
    <section aria-label="Weekly muscle coaching" className="weekly-muscles">
      <h3>Muscle-by-muscle</h3>
      <p className="caption">
        Assigned and completed primary work. Indirect involvement and advanced
        bouts stay separate.
      </p>
      {!!(
        calendar.planned +
        calendar.missed +
        calendar.skipped +
        calendar.active +
        calendar.unavailable +
        calendar.revised
      ) && (
        <p className="caption">
          Calendar · {calendar.planned} still planned · {calendar.missed} missed
          · {calendar.skipped} skipped
          {calendar.active ? ` · ${calendar.active} active draft excluded` : ""}
          {calendar.unavailable
            ? ` · ${calendar.unavailable} routine unavailable`
            : ""}
          {calendar.revised
            ? ` · ${calendar.revised} plans changed after this week; prior status unknown`
            : ""}
          . No catch-up sets are added.
        </p>
      )}
      {!review.current && (
        <p className="caption">
          {review.future
            ? "Upcoming calendar estimates use your current routine; they are not completed work."
            : "Historical workout summary includes current saved corrections. Live target reviews are in the current week."}
        </p>
      )}
      {active && review.current && (
        <p role="status" className="caption">
          Finish your active workout before reviewing future program targets.
        </p>
      )}
      {review.rows.map((r) => (
        <article
          key={r.muscle}
          className="muscle-week-card"
          aria-label={`${r.muscle} weekly review`}
        >
          <div className="muscle-week-heading">
            <h4>{r.muscle}</h4>
            <span>{r.action.label}</span>
          </div>
          <ComparisonBars
            title={`${r.muscle} work`}
            rows={[
              {
                label: "Completed",
                value: r.completed,
                secondary: r.assigned,
                secondaryLabel: "Assigned",
              },
            ]}
          />
          {r.assigned === null && (
            <p className="caption">
              {r.knownAssigned} known assigned sets + unknown dose.
            </p>
          )}
          {!!r.indirect && (
            <p className="caption">
              Secondary involvement in {r.indirect} completed working sets, kept
              separate from primary work.
            </p>
          )}
          {!!r.unknownEffort && (
            <p className="caption">
              Actual effort unreported on {r.unknownEffort} primary working
              sets.
            </p>
          )}
          {!!r.upcoming && (
            <p className="caption">
              Still planned: {r.upcoming} primary working sets · current routine
              estimate.
            </p>
          )}
          {!!r.omitted && (
            <p className="caption">
              {r.omitted} primary working sets deliberately omitted in reviewed
              shorter plans. Excluded from assigned work.
            </p>
          )}
          {!!(r.advanced || r.indirectAdvanced) && (
            <p className="caption">
              Advanced work: {r.advanced} primary and {r.indirectAdvanced}{" "}
              indirect bouts, counted separately.
            </p>
          )}
          <p className="muscle-week-action">{r.action.reason}</p>
          <details>
            <summary>Performance, recovery and evidence</summary>
            <p className="caption">{r.action.reason}</p>
            <dl className="muscle-evidence">
              <div>
                <dt>Effort-qualified primary work</dt>
                <dd>{r.qualified}</dd>
              </div>
              <div>
                <dt>Unreported primary effort</dt>
                <dd>{r.unknownEffort}</dd>
              </div>
              <div>
                <dt>Indirect involvement</dt>
                <dd>
                  {r.indirect} working sets · {r.indirectQualified}{" "}
                  effort-qualified
                </dd>
              </div>
              <div>
                <dt>Advanced bouts</dt>
                <dd>
                  {r.advanced} primary · {r.indirectAdvanced} indirect
                </dd>
              </div>
              <div>
                <dt>Saved muscle exposures</dt>
                <dd>{r.exposures}</dd>
              </div>
            </dl>
            <p className="caption">
              Effort-qualified means explicitly reported RIR of 4 or less, an
              app estimate. It does not measure muscle growth. Indirect work is
              never added to primary sets.
            </p>
            {r.accepted && (
              <p className="caption">
                Accepted change: {r.accepted.status} · {r.accepted.followups}{" "}
                eligible follow-ups
                {r.accepted.edited ? " · edited targets" : ""}
                {r.accepted.bundled
                  ? " · coordinated changes; individual effects unknown"
                  : ""}
                . Target attainment does not prove that the change caused
                progress.
              </p>
            )}
            {!!r.unknownAssignments && (
              <p className="caption">
                {r.unknownAssignments} entries have no known assigned count.
                Current routines do not fill in missing historical
                prescriptions.
              </p>
            )}
            {!!r.unconfirmedContext && (
              <p className="caption">
                {r.unconfirmedContext} completed primary sets lack timely
                confirmation of usual rest and consistent execution.
              </p>
            )}
            {r.changes.length ? (
              <ul>
                {r.changes.map((c, i) => (
                  <li key={i}>
                    {c.name} · {c.repDelta > 0 ? "+" : ""}
                    {c.repDelta} reps · {c.previousDate} → {c.date}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="caption">
                No matching confirmed lift comparison in this week.
              </p>
            )}
            <p className="caption">{r.recovery.evidence[0]}</p>
            {r.recovery.report && (
              <p className="caption">
                Last saved muscle report:{" "}
                {new Date(r.recovery.report.at).toLocaleDateString()} · Recovery{" "}
                {r.recovery.report.recovered ?? "unknown"} · Pain{" "}
                {r.recovery.report.pain === null ||
                r.recovery.report.pain === undefined
                  ? "unknown"
                  : r.recovery.report.pain
                    ? "yes"
                    : "no"}{" "}
                · Soreness {r.recovery.report.soreness ?? "unknown"}. A past
                report does not confirm readiness now.
              </p>
            )}
          </details>
          {r.target && openTargets && (
            <Button
              disabled={active}
              onClick={() => openTargets(r.target!.session, r.target!.entry.id)}
            >
              Review {r.muscle} targets
            </Button>
          )}
        </article>
      ))}
      {!review.rows.length && (
        <p className="empty-caption">
          No saved work or available upcoming plan for this week.
        </p>
      )}
      <details>
        <summary>How volume is counted</summary>
        <p className="caption">
          Historical summaries use current corrected records; they do not
          reconstruct old database versions. Timestamped reports after the
          selected week are excluded. Assigned counts use saved working-dose
          snapshots, including accepted but unlogged exercises retained in a
          shorter plan. Entirely omitted exercises may be absent from older
          logs; these totals cover recorded assignments. Warmups are excluded.
          Current routine estimates appear only for explicit upcoming calendar
          plans. Missed plans do not reconstruct old doses or trigger make-up
          work.
        </p>
      </details>
    </section>
  );
}
