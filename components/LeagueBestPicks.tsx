import Link from "next/link";
import type {
  UiLeagueBestPicks,
  UiOpportunity,
} from "@/lib/data/uiOpportunities";

function marketLabel(key: string): string {
  if (key === "h2h") return "MATCH WINNER";
  if (key === "totals") return "TOTAL";
  if (key === "spreads") return "HANDICAP";
  if (key === "double_chance") return "DOUBLE CHANCE";
  return key.replaceAll("_", " ").toUpperCase();
}

function selectionLabel(opportunity: UiOpportunity): string {
  if (opportunity.point === null || !Number.isFinite(opportunity.point)) {
    return opportunity.selectionName;
  }
  if (opportunity.selectionName.includes(String(opportunity.point))) {
    return opportunity.selectionName;
  }
  if (opportunity.marketKey === "spreads") {
    const point =
      opportunity.point > 0
        ? `+${opportunity.point}`
        : String(opportunity.point);
    return `${opportunity.selectionName} ${point}`;
  }
  return `${opportunity.selectionName} ${opportunity.point}`;
}

function formatStart(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function matchup(opportunity: UiOpportunity): string {
  return `${opportunity.home ?? "Participant"} vs ${opportunity.away ?? "Participant"}`;
}

export function LeagueBestPicks({
  groups,
}: {
  groups: UiLeagueBestPicks[];
}) {
  if (groups.length === 0) return null;

  return (
    <section
      className="best-picks-section"
      aria-labelledby="best-picks-by-league-title"
    >
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">NEXT 7 DAYS</p>
          <h2 id="best-picks-by-league-title">Best picks by league</h2>
        </div>
        <span className="count-badge">{groups.length} LEAGUES</span>
      </div>

      <p className="best-picks-intro">
        EDGE shows up to three distinct qualified games per league. A league
        may show only one or two when the evidence does not support a third.
      </p>

      <div className="league-best-picks-list">
        {groups.map((group) => (
          <article className="league-best-picks-card" key={group.key}>
            <header className="league-best-picks-head">
              <div>
                <span>
                  {group.sport.toUpperCase()}
                  {group.country ? ` · ${group.country.toUpperCase()}` : ""}
                </span>
                <h3>{group.league}</h3>
              </div>
              <strong>{group.picks.length} PICK{group.picks.length === 1 ? "" : "S"}</strong>
            </header>

            <div className="league-best-picks-rows">
              {group.picks.map((pick, index) => (
                <Link
                  href={`/analysis/${pick.eventId}`}
                  className="league-best-pick-row"
                  key={pick.predictionId}
                >
                  <div className="league-best-pick-rank">
                    #{index + 1}
                  </div>

                  <div className="league-best-pick-main">
                    <span>
                      {marketLabel(pick.marketKey)} · {formatStart(pick.startsAt)}
                    </span>
                    <strong>{selectionLabel(pick)}</strong>
                    <p>{matchup(pick)}</p>
                  </div>

                  <div className="league-best-pick-metrics">
                    <b>{pick.bestDecimalOdds.toFixed(2)}</b>
                    <span>EDGE {pick.edgeScore}/100</span>
                  </div>
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
