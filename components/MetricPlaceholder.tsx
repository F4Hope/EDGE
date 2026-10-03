type MetricPlaceholderProps = {
  label: string;
  value?: string;
  note?: string;
  state?: "pending" | "ready" | "unconfirmed";
};

export function MetricPlaceholder({
  label,
  value = "—",
  note,
  state = "pending",
}: MetricPlaceholderProps) {
  return (
    <div className="metric-placeholder">
      <span className="metric-placeholder-label">{label}</span>
      <strong>{value}</strong>
      {note ? <span className={`metric-note ${state}`}>{note}</span> : null}
    </div>
  );
}
