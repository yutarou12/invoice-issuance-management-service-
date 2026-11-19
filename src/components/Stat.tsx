export default function Stat({
  label,
  value,
  hint,
  suffix,
  warning,
}: {
  label: string;
  value: string;
  hint: string;
  suffix?: string;
  warning?: boolean;
}) {
  return (
    <div className={`stat-card${warning ? ' warning' : ''}`}>
      <div className="stat-label">
        {label}
        <span className="stat-mark">{warning ? '!' : '↗'}</span>
      </div>
      <div className="stat-value">
        {value}
        <small>{suffix}</small>
      </div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}
