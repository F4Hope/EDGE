"use client";

import { useEffect, useState } from "react";
import { ParticipantBadge } from "@/components/ParticipantBadge";
import type { ComboBuildResult } from "@/lib/combo/engine";
import type { SupportedSport } from "@/lib/providers/types";

type ApiResponse = {
  data?: ComboBuildResult;
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

export function ComboPickCard({
  initialResult,
}: {
  initialResult: ComboBuildResult | null;
}) {
  const [result, setResult] = useState<ComboBuildResult | null>(initialResult);
  const [stake, setStake] = useState("100");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [dayLabel, setDayLabel] = useState(() => localTodayWindow().label);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stakeValue = safeStake(stake);
  const returnValue = result?.actualOdds
    ? Number((stakeValue * result.actualOdds).toFixed(2))
    : 0;
  const profit = Math.max(0, returnValue - stakeValue);

  async function refreshCombo() {
    setRefreshing(true);
    setError(null);

    try {
      const today = localTodayWindow();
      setDayLabel(today.label);

      const response = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          targetOdds: 2,
          riskMode: "BALANCED",
          windowStart: today.start,
          windowEnd: today.end,
        }),
      });

      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to rebuild the Combo.");
      }

      setResult(payload.data);
      setUpdatedAt(new Date());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to rebuild the Combo.",
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

  async function copySelections() {
    if (!result || result.legs.length === 0) return;

    const text = [
      "EDGE COMBO PICK",
      ...result.legs.map(
        (leg, index) =>
          `${index + 1}. ${leg.selectionName} — ${leg.matchup} @ ${leg.decimalOdds.toFixed(2)}`,
      ),
      `Total odds: ${result.actualOdds?.toFixed(2) ?? "—"}`,
      `Stake: FCFA ${stakeValue.toFixed(2)}`,
      `Potential return: FCFA ${returnValue.toFixed(2)}`,
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const hasCombo = Boolean(
    result && result.legs.length >= 2 && result.actualOdds,
  );

  return (
    <section className="combo-pick-layout" aria-live="polite">
      <div className="combo-pick-main">
        <div className="combo-pick-card">
          <div className="combo-pick-card-head">
            <div>
              <span className="combo-pick-kicker">🏆 TODAY ONLY · {dayLabel.toUpperCase()}</span>
              <h2>Today’s Combo Pick</h2>
              <p>Balanced 2x target · only games scheduled for today · real stored bookmaker prices</p>
            </div>
            <span className="combo-pick-risk">BALANCED</span>
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
                        {leg.league} · {formatStart(leg.startsAt)}
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
                      aria-label="Bet amount in FCFA"
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
                onClick={() => void copySelections()}
              >
                {copied ? "✓ COPIED" : "⚡ COPY COMBO"}
              </button>
            </>
          ) : (
            <div className="combo-pick-empty">
              <strong>No qualifying Combo for today.</strong>
              <p>
                EDGE will not borrow games from tomorrow, Sunday, or another
                future date. If fewer than two qualified priced games remain
                today, no Combo is shown.
              </p>
            </div>
          )}

          {error ? <p className="combo-pick-error">{error}</p> : null}
        </div>
      </div>

      <aside className="combo-pick-side">
        <div className="combo-control-card">
          <span className="combo-control-label">LIVE CONTROLS</span>
          <strong>2x · BALANCED</strong>
          <p>
            Manual refresh plus automatic rebuild every five minutes. The ticket
            is restricted to today’s local calendar date.
          </p>
          <button
            type="button"
            className="combo-refresh-button"
            disabled={refreshing}
            onClick={() => void refreshCombo()}
          >
            {refreshing ? "REFRESHING…" : "↻ REFRESH COMBO"}
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
          <span>WHY THIS TICKET</span>
          <ul>
            <li>✓ Today’s events only</li>
            <li>✓ Future pre-live events only</li>
            <li>✓ Real stored bookmaker prices</li>
            <li>✓ One selection per event</li>
            <li>✓ Model quality gates preserved</li>
            <li>✓ Completed events automatically drop out</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}
