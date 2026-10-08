"use client";

import { useEffect, useState } from "react";
import { ParticipantBadge } from "@/components/ParticipantBadge";
import type { ComboBuildResult } from "@/lib/combo/engine";
import type { SupportedSport } from "@/lib/providers/types";

type PairedComboData = {
  minimumCombinedOdds: number;
  low: ComboBuildResult | null;
  balanced: ComboBuildResult | null;
  excludedBalancedEventIds: string[];
  candidateCount: number;
};

type ApiResponse = {
  data?: PairedComboData;
  error?: string;
};

function marketLabel(key: string): string {
  if (key === "h2h") return "MATCH WINNER";
  if (key === "totals") return "OVER / UNDER";
  if (key === "spreads") return "HANDICAP";
  if (key === "double_chance") return "DOUBLE CHANCE";
  return key.replaceAll("_", " ").toUpperCase();
}

function formatStart(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function localTodayWindow(): {
  start: string;
  end: string;
  label: string;
} {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: new Intl.DateTimeFormat("en", {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(start),
  };
}

function safeStake(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function TicketCard({
  title,
  subtitle,
  result,
  stake,
  setStake,
  copied,
  onCopy,
  tone,
}: {
  title: string;
  subtitle: string;
  result: ComboBuildResult | null;
  stake: string;
  setStake: (value: string) => void;
  copied: boolean;
  onCopy: () => void;
  tone: "low" | "balanced";
}) {
  const stakeValue = safeStake(stake);
  const returnValue = result?.actualOdds
    ? Number((stakeValue * result.actualOdds).toFixed(2))
    : 0;
  const profit = Math.max(0, returnValue - stakeValue);
  const hasCombo = Boolean(
    result &&
      result.status === "TARGET_REACHED" &&
      result.actualOdds !== null &&
      result.actualOdds >= 2.3 &&
      result.legs.length >= 2,
  );

  return (
    <div className={`combo-pick-card combo-pick-card-${tone}`}>
      <div className="combo-pick-card-head">
        <div>
          <span className="combo-pick-kicker">
            {tone === "low" ? "🛡 LOW-RISK TICKET" : "⚡ BALANCED TICKET"}
          </span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className={`combo-pick-risk combo-pick-risk-${tone}`}>
          {tone === "low" ? "LOW" : "BALANCED"}
        </span>
      </div>

      {hasCombo && result ? (
        <>
          <div className="combo-ticket-legs">
            {result.legs.map((leg, index) => (
              <article className="combo-ticket-leg" key={leg.predictionId}>
                <span className="combo-ticket-index">{index + 1}</span>

                <div className="combo-ticket-participants">
                  <ParticipantBadge
                    participant={leg.homeParticipant}
                    sport={leg.sport as SupportedSport}
                  />
                  <ParticipantBadge
                    participant={leg.awayParticipant}
                    sport={leg.sport as SupportedSport}
                    compact
                  />
                </div>

                <div className="combo-ticket-copy">
                  <span>
                    {leg.sport.toUpperCase()} · {leg.league} · {formatStart(leg.startsAt)}
                  </span>
                  <strong>{leg.selectionName}</strong>
                  <p>{leg.matchup}</p>
                  <small>{marketLabel(leg.marketKey)}</small>
                </div>

                <div className="combo-ticket-odds">
                  <span>ODDS</span>
                  <strong>{leg.decimalOdds.toFixed(2)}</strong>
                </div>
              </article>
            ))}
          </div>

          <div className="combo-ticket-summary">
            <div>
              <span>TOTAL ODDS</span>
              <strong>{result.actualOdds?.toFixed(2)}</strong>
            </div>
            <label>
              <span>BET AMOUNT</span>
              <div className="stake-input-wrap">
                <b>FCFA</b>
                <input
                  inputMode="decimal"
                  value={stake}
                  onChange={(event) => setStake(event.target.value)}
                  aria-label={`${title} bet amount in FCFA`}
                />
              </div>
            </label>
            <div>
              <span>POTENTIAL RETURN</span>
              <strong>FCFA {returnValue.toFixed(2)}</strong>
            </div>
          </div>

          <div className="combo-profit-row">
            <span>Potential profit</span>
            <strong>FCFA {profit.toFixed(2)}</strong>
          </div>

          <button
            type="button"
            className="combo-copy-button"
            onClick={onCopy}
          >
            {copied ? "✓ COPIED" : "⚡ COPY TICKET"}
          </button>
        </>
      ) : (
        <div className="combo-pick-empty">
          <strong>
            No qualifying Combo for today — {tone === "low" ? "LOW" : "BALANCED"} ticket does not reach 2.30.
          </strong>
          <p>
            EDGE will not borrow games from tomorrow, Sunday, or another future
            date, and it will not lower the 2.30 minimum just to create a ticket.
          </p>
        </div>
      )}
    </div>
  );
}

export function ComboPickCard({
  initialResult: _initialResult,
}: {
  initialResult: ComboBuildResult | null;
}) {
  const [data, setData] = useState<PairedComboData | null>(null);
  const [lowStake, setLowStake] = useState("100");
  const [balancedStake, setBalancedStake] = useState("100");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [dayLabel, setDayLabel] = useState(() => localTodayWindow().label);
  const [copied, setCopied] = useState<"low" | "balanced" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshCombo() {
    setRefreshing(true);
    setError(null);

    try {
      const today = localTodayWindow();
      setDayLabel(today.label);

      const response = await fetch("/api/combo-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          windowStart: today.start,
          windowEnd: today.end,
        }),
      });

      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to rebuild today’s Combo Picks.");
      }

      setData(payload.data);
      setUpdatedAt(new Date());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to rebuild today’s Combo Picks.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshCombo();
    }, 0);

    const id = window.setInterval(() => {
      void refreshCombo();
    }, 5 * 60 * 1000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, []);

  async function copySelections(
    result: ComboBuildResult | null,
    stake: string,
    ticket: "low" | "balanced",
  ) {
    if (!result || result.legs.length === 0) return;

    const stakeValue = safeStake(stake);
    const returnValue = result.actualOdds
      ? Number((stakeValue * result.actualOdds).toFixed(2))
      : 0;

    const text = [
      `EDGE TODAY ${ticket.toUpperCase()} COMBO`,
      ...result.legs.map(
        (leg, index) =>
          `${index + 1}. ${leg.selectionName} — ${leg.matchup} @ ${leg.decimalOdds.toFixed(2)}`,
      ),
      `Total odds: ${result.actualOdds?.toFixed(2) ?? "—"}`,
      `Stake: FCFA ${stakeValue.toFixed(2)}`,
      `Potential return: FCFA ${returnValue.toFixed(2)}`,
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(ticket);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <section className="combo-pick-layout" aria-live="polite">
      <div className="combo-pick-main combo-pick-main-paired">
        <div className="combo-pick-day-banner">
          <div>
            <span>🏆 TODAY ONLY · {dayLabel.toUpperCase()}</span>
            <strong>Two separate Combo tickets</strong>
          </div>
          <b>MINIMUM ODDS 2.30</b>
        </div>

        <div className="combo-pick-pair">
          <TicketCard
            title="LOW Combo"
            subtitle="Strict LOW-risk gates only · minimum combined odds 2.30"
            result={data?.low ?? null}
            stake={lowStake}
            setStake={setLowStake}
            copied={copied === "low"}
            onCopy={() => void copySelections(data?.low ?? null, lowStake, "low")}
            tone="low"
          />

          <TicketCard
            title="BALANCED Combo"
            subtitle="Different events from LOW · minimum combined odds 2.30"
            result={data?.balanced ?? null}
            stake={balancedStake}
            setStake={setBalancedStake}
            copied={copied === "balanced"}
            onCopy={() =>
              void copySelections(data?.balanced ?? null, balancedStake, "balanced")
            }
            tone="balanced"
          />
        </div>

        {error ? <p className="combo-pick-error">{error}</p> : null}
      </div>

      <aside className="combo-pick-side">
        <div className="combo-control-card">
          <span className="combo-control-label">LIVE CONTROLS</span>
          <strong>LOW + BALANCED · 2.30+</strong>
          <p>
            Both tickets rebuild together. The BALANCED ticket is generated only
            after removing every event already used by the LOW ticket.
          </p>
          <button
            type="button"
            className="combo-refresh-button"
            aria-label="REFRESH COMBO"
            disabled={refreshing}
            onClick={() => void refreshCombo()}
          >
            {refreshing ? "REFRESHING…" : "↻ REFRESH BOTH TICKETS"}
          </button>
          <small>
            Last rebuilt{" "}
            {updatedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </div>

        <div className="combo-why-card">
          <span>PAIR RULES</span>
          <ul>
            <li>✓ Today’s events only</li>
            <li>✓ LOW and BALANCED shown together</li>
            <li>✓ Minimum combined odds 2.30 each</li>
            <li>✓ No event appears in both tickets</li>
            <li>✓ Football, basketball and tennis are eligible</li>
            <li>✓ Real stored bookmaker prices only</li>
            <li>✓ Started/completed events drop out</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}
