import Link from "next/link";
import { ParticipantBadge } from "@/components/ParticipantBadge";
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

function formatProvider(provider: string): string {
  if (provider === "api-sports") return "API-SPORTS";
  if (provider === "odds-api") return "ODDS API";
  return provider.replaceAll("-", " ").toUpperCase();
}

function formatOddsAge(iso: string): string {
  const capturedAt = new Date(iso).getTime();
  if (!Number.isFinite(capturedAt)) return "AGE UNKNOWN";

  const ageMs = Math.max(0, Date.now() - capturedAt);
  const minutes = Math.floor(ageMs / 60_000);

  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return `${minutes}M OLD`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H OLD`;

  const days = Math.floor(hours / 24);
  return `${days}D OLD`;
}

function quoteRole(selectionKey: string): string {
  if (selectionKey === "home") return "HOME";
  if (selectionKey === "draw") return "DRAW";
  if (selectionKey === "away") return "AWAY";
  return "MARKET";
}

export function EventCard({ event }: { event: UiEvent }) {
  return (
    <Link href={`/analysis/${event.id}`} className="event-card-full">
      <div className="event-card-top">
        <span className="sport-code compact-code">{sportCodes[event.sport]}</span>
        <span className="event-status">{event.status.replaceAll("_", " ")}</span>
      </div>

      <div className="event-card-match visual-matchup">
        <div className="visual-participant">
          <ParticipantBadge participant={event.homeParticipant} sport={event.sport} />
          <strong>{event.home ?? "Participant unavailable"}</strong>
        </div>
        <span>vs</span>
        <div className="visual-participant away">
          <ParticipantBadge participant={event.awayParticipant} sport={event.sport} />
          <strong>{event.away ?? "Participant unavailable"}</strong>
        </div>
      </div>

      <div className="event-card-meta">
        <span>{event.league}</span>
        <span>{formatStartTime(event.startsAt)}</span>
      </div>

      {event.h2hOdds.length > 0 ? (
        <div className="event-card-odds" aria-label="Best head-to-head odds">
          {event.h2hOdds.map((quote) => (
            <div className="event-odds-quote" key={quote.selectionKey}>
              <span className="event-odds-role">{quoteRole(quote.selectionKey)}</span>
              <strong>{quote.decimalOdds.toFixed(2)}</strong>
              <span
                className="event-odds-selection"
                title={quote.selectionName}
              >
                {quote.selectionName}
              </span>
              <small
                className="event-odds-source"
                title={`${quote.bookmakerName ?? "Bookmaker"} · ${formatProvider(quote.provider)}`}
              >
                {quote.bookmakerName ?? "Bookmaker"} · {formatProvider(quote.provider)}
              </small>
              <small
                className="event-odds-age"
                title={new Date(quote.capturedAt).toLocaleString("en")}
              >
                {formatOddsAge(quote.capturedAt)}
              </small>
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
