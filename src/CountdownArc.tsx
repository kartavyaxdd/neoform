export function CountdownArc({
  seconds,
  total,
}: {
  seconds: number;
  total: number;
}) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  return (
    <svg className="countdown-arc" viewBox="0 0 48 48" aria-hidden="true">
      <circle className="arc-track" cx="24" cy="24" r="20" />
      <circle
        className="arc-value"
        cx="24"
        cy="24"
        r="20"
        pathLength="100"
        strokeDasharray={`${ratio * 100} 100`}
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}
