import Link from "next/link";
import type { UiOpportunity } from "@/lib/data/uiOpportunities";

const sportCodes: Record<UiOpportunity["sport"], string> = {
  football: "FT",
  basketball: "BK",
  tennis: "TN",
};

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function signedPercent(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${(value * 100).toFixed(1)}%`;
}

function formatStart(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function OpportunityCard({
  opportunity,
  rank,
}: {
  opportunity: UiOpportunity;
  rank: number;
}) {
  const validationGated =
    opportunity.bettableEnabled !== true ||
    opportunity.validationState === "UNVALIDATED_BASELINE";

  return (
    <Link
      className="opportunity-card"
      href={`/analysis/${opportunity.eventId}`}
    >
      <div className="opportunity-card-head">
        <div>
          <span className="opportunity-rank">#{String(rank).padStart(2, "0")}</span>
          <span className="sport-code compact-code">
            {sportCodes[opportunity.sport]}
          </span>
        </div>
        <div>
          <span className={`status-pill ${opportunity.status === "BETTABLE" ? "" : "watch"}`}>
            {opportunity.status}
          </span>
          <span className="opportunity-risk">{opportunity.risk} RISK</span>
        </div>
      </div>

      <div className="opportunity-match">
        <span>{opportunity.league}</span>
        <h3>
          {opportunity.home ?? "Participant"} <i>vs</i>{" "}
          {opportunity.away ?? "Participant"}
        </h3>
        <small>{formatStart(opportunity.startsAt)}</small>
      </div>

      <div className="opportunity-selection">
        <span>MODEL SELECTION</span>
        <strong>{opportunity.selectionName}</strong>
        <b>{opportunity.bestDecimalOdds.toFixed(2)}</b>
      </div>

      <div className="opportunity-metrics">
        <div>
          <span>MODEL</span>
          <strong>{percent(opportunity.modelProbability)}</strong>
        </div>
        <div>
          <span>MARKET</span>
          <strong>
            {opportunity.marketProbability === null
              ? "—"
              : percent(opportunity.marketProbability)}
          </strong>
        </div>
        <div>
          <span>EST. VALUE</span>
          <strong>{signedPercent(opportunity.estimatedValue)}</strong>
        </div>
        <div>
          <span>QUALITY</span>
          <strong>{percent(opportunity.dataQuality, 0)}</strong>
        </div>
        <div>
          <span>AGREEMENT</span>
          <strong>{percent(opportunity.modelAgreement, 0)}</strong>
        </div>
        <div>
          <span>BOOKS</span>
          <strong>{opportunity.bookmakerCount ?? "—"}</strong>
        </div>
      </div>

      <div className="opportunity-card-foot">
        <span>
          {validationGated
            ? "VALIDATION-GATED ANALYTICAL WATCH"
            : "MODEL GATE PASSED"}
        </span>
        <span>VIEW ANALYSIS →</span>
      </div>
    </Link>
  );
}
