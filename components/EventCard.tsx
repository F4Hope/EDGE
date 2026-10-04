import Link from "next/link";
import type { UiEvent } from "@/lib/data/uiEvents";

const sportCodes: Record<UiEvent["sport"], string> = {
  football: "FT",
  basketball: "BK",
  tennis: "TN",
};

function formatStartTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function EventCard({ event }: { event: UiEvent }) {
  return (
    <Link href={`/analysis/${event.id}`} className="event-card-full">
      <div className="event-card-top">
        <span className="sport-code compact-code">{sportCodes[event.sport]}</span>
        <span className="event-status">{event.status.replaceAll("_", " ")}</span>
      </div>

      <div className="event-card-match">
        <strong>{event.home ?? "Participant unavailable"}</strong>
        <span>vs</span>
        <strong>{event.away ?? "Participant unavailable"}</strong>
      </div>

      <div className="event-card-meta">
        <span>{event.league}</span>
        <span>{formatStartTime(event.startsAt)}</span>
      </div>

      {event.h2hOdds.length > 0 ? (
        <div className="event-card-odds" aria-label="Best head-to-head odds">
          {event.h2hOdds.map((quote) => (
            <div className="event-odds-quote" key={quote.selectionKey}>
              <span title={quote.selectionName}>{quote.selectionName}</span>
              <strong>{quote.decimalOdds.toFixed(2)}</strong>
              <small>{quote.bookmakerName ?? "Bookmaker"}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="event-card-odds-empty">
          H2H ODDS NOT SYNCED FOR THIS EVENT
        </div>
      )}

      <div className="event-card-foot">
        <span>{event.country ?? event.provider}</span>
        <span>VIEW EVENT →</span>
      </div>
    </Link>
  );
}
