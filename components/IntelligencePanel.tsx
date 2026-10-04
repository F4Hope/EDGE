import type { UiIntelligenceSignal } from "@/lib/data/uiIntelligence";

export function IntelligencePanel({
  signals,
}: {
  signals: UiIntelligenceSignal[];
}) {
  return (
    <div className="intelligence-list">
      {signals.map((signal) => (
        <article className="intelligence-item" key={signal.id}>
          <div>
            <span className={`signal-severity ${signal.severity.toLowerCase()}`}>
              {signal.severity}
            </span>
            <span className="signal-type">{signal.type.replaceAll("_", " ")}</span>
          </div>
          <h3>{signal.headline}</h3>
          {signal.summary ? <p>{signal.summary}</p> : null}
          <footer>
            <span>{signal.source}</span>
            <span>{new Date(signal.occurredAt).toLocaleString("en")}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}
