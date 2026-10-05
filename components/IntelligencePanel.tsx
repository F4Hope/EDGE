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

          {signal.citations.length > 0 ? (
            <div className="intelligence-citations" aria-label="Grounded sources">
              {signal.citations.map((citation, index) => (
                <a
                  key={citation.url}
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  SOURCE {index + 1}
                  {citation.title ? ` · ${citation.title}` : ""}
                </a>
              ))}
            </div>
          ) : null}

          <footer>
            <span>{signal.source}</span>
            <span>{new Date(signal.occurredAt).toLocaleString("en")}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}
