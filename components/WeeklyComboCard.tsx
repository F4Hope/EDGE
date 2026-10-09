"use client";

import { useEffect, useMemo, useState } from "react";
import { ParticipantBadge } from "@/components/ParticipantBadge";
import type { WeeklyComboResult } from "@/lib/combo/weekly";
import type { SupportedSport } from "@/lib/providers/types";

type ApiResponse = {
  data?: WeeklyComboResult;
  error?: string;
};

function localWeekWindow(): {
  start: string;
  end: string;
  timeZone: string;
  label: string;
} {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const sunday = new Date(end.getTime() - 1);
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  });

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    label: `${formatter.format(start)} – ${formatter.format(sunday)}`,
  };
}

function safeStake(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatStart(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function marketLabel(key: string): string {
  if (key === "h2h") return "MATCH WINNER";
  if (key === "totals") return "OVER / UNDER";
  if (key === "spreads") return "HANDICAP";
  if (key === "double_chance") return "DOUBLE CHANCE";
  return key.replaceAll("_", " ").toUpperCase();
}

export function WeeklyComboCard() {
  const [result, setResult] = useState<WeeklyComboResult | null>(null);
  const [stake, setStake] = useState("100");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [weekLabel, setWeekLabel] = useState(() => localWeekWindow().label);
  const [error, setError] = useState<string | null>(null);

  const stakeValue = safeStake(stake);
  const potentialReturn =
    result?.actualOdds === null || result?.actualOdds === undefined
      ? 0
      : Number((stakeValue * result.actualOdds).toFixed(2));

  const grouped = useMemo(() => {
    const groups = new Map<string, WeeklyComboResult["legs"]>();

    for (const leg of result?.legs ?? []) {
      const key = new Intl.DateTimeFormat("en", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(new Date(leg.startsAt));
      const rows = groups.get(key) ?? [];
      rows.push(leg);
      groups.set(key, rows);
    }

    return [...groups.entries()];
  }, [result]);

  async function refreshWeekly() {
    setLoading(true);
    setError(null);

    try {
      const week = localWeekWindow();
      setWeekLabel(week.label);

      const response = await fetch("/api/combos/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          weekStart: week.start,
          weekEnd: week.end,
          timeZone: week.timeZone,
        }),
      });

      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to build the weekly Combo.");
      }

      setResult(payload.data);
      setUpdatedAt(new Date());
    } catch (caught) {
      setResult(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to build the weekly Combo.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshWeekly();
    }, 0);

    const regular = window.setInterval(() => {
      void refreshWeekly();
    }, 30 * 60 * 1000);

    let boundary: number | undefined;
    const scheduleNextMonday = () => {
      const nextWeek = new Date(localWeekWindow().end).getTime();
      const delay = Math.max(1000, nextWeek - Date.now() + 1500);
      boundary = window.setTimeout(() => {
        void refreshWeekly();
        scheduleNextMonday();
      }, delay);
    };
    scheduleNextMonday();

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(regular);
      if (boundary !== undefined) window.clearTimeout(boundary);
    };
  }, []);

  async function copyTicket() {
    if (!result || result.legs.length === 0) return;

    const text = [
      `EDGE WEEKLY COMBO · ${weekLabel}`,
      ...result.legs.map(
        (leg, index) =>
          `${index + 1}. ${leg.selectionName} — ${leg.matchup} @ ${leg.decimalOdds.toFixed(2)} · ${percent(leg.modelProbability)}`,
      ),
      `Combined odds: ${result.actualOdds?.toFixed(2) ?? "—"}`,
      `Stake: FCFA ${stakeValue.toFixed(2)}`,
      `Potential return: FCFA ${potentialReturn.toFixed(2)}`,
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="weekly-combo-layout" aria-live="polite">
      <div className="weekly-combo-main">
        <div className="weekly-combo-hero">
          <div>
            <span>MONDAY → SUNDAY · CURRENT WEEK</span>
            <h2>Weekly Cumulative Ticket</h2>
            <p>{weekLabel} · highest-probability qualified selections first</p>
          </div>
          <div className="weekly-combo-badge">
            <strong>{result?.legs.length ?? 0}</strong>
            <span>LEGS</span>
          </div>
        </div>

        {result?.legs.length ? (
          <>
            <div className="weekly-combo-stats">
              <div>
                <span>COMBINED ODDS</span>
                <strong>{result.actualOdds?.toFixed(2) ?? "—"}</strong>
              </div>
              <div>
                <span>DAYS COVERED</span>
                <strong>{result.distinctDays}</strong>
              </div>
              <div>
                <span>SPORTS</span>
                <strong>{result.distinctSports}</strong>
              </div>
              <div>
                <span>MIN LEG PROBABILITY</span>
                <strong>{Math.round(result.minProbability * 100)}%</strong>
              </div>
            </div>

            <p className="weekly-combo-message">{result.message}</p>

            <div className="weekly-combo-days">
              {grouped.map(([day, legs]) => (
                <section className="weekly-day-card" key={day}>
                  <div className="weekly-day-head">
                    <strong>{day}</strong>
                    <span>{legs.length} PICK{legs.length === 1 ? "" : "S"}</span>
                  </div>

                  {legs.map((leg) => (
                    <article className="weekly-leg" key={leg.predictionId}>
                      <div className="weekly-leg-visuals">
                        <ParticipantBadge
                          participant={leg.homeParticipant}
                          sport={leg.sport as SupportedSport}
                          compact
                        />
                        <ParticipantBadge
                          participant={leg.awayParticipant}
                          sport={leg.sport as SupportedSport}
                          compact
                        />
                      </div>
                      <div className="weekly-leg-copy">
                        <span>
                          {leg.sport.toUpperCase()} · {leg.league} · {formatStart(leg.startsAt)}
                        </span>
                        <strong>{leg.selectionName}</strong>
                        <p>{leg.matchup}</p>
                        <small>
                          {marketLabel(leg.marketKey)} · MODEL {percent(leg.modelProbability)} · {leg.risk}
                        </small>
                      </div>
                      <div className="weekly-leg-odds">
                        <span>ODDS</span>
                        <strong>{leg.decimalOdds.toFixed(2)}</strong>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>

            <div className="weekly-stake-card">
              <label>
                <span>BET AMOUNT</span>
                <div className="stake-input-wrap">
                  <b>FCFA</b>
                  <input
                    inputMode="decimal"
                    value={stake}
                    onChange={(event) => setStake(event.target.value)}
                    aria-label="Weekly Combo bet amount in FCFA"
                  />
                </div>
              </label>
              <div>
                <span>POTENTIAL RETURN</span>
                <strong>FCFA {potentialReturn.toFixed(2)}</strong>
              </div>
              <button type="button" onClick={() => void copyTicket()}>
                {copied ? "✓ COPIED" : "⚡ COPY WEEKLY TICKET"}
              </button>
            </div>
          </>
        ) : (
          <div className="combo-pick-empty">
            <strong>
              {loading ? "Building this week’s ticket…" : "No qualifying weekly ticket yet."}
            </strong>
            <p>
              EDGE only uses future games remaining in the current Monday-Sunday
              window. It will not add low-probability legs merely to make the
              accumulator longer.
            </p>
          </div>
        )}

        {error ? <p className="combo-pick-error">{error}</p> : null}
      </div>

      <aside className="weekly-combo-side">
        <div className="combo-control-card">
          <span className="combo-control-label">WEEKLY REFRESH</span>
          <strong>Probability first</strong>
          <p>
            EDGE checks the weekly ticket every 30 minutes and automatically
            moves to the new Monday-Sunday window when Monday begins.
          </p>
          <button
            type="button"
            className="combo-refresh-button"
            disabled={loading}
            onClick={() => void refreshWeekly()}
          >
            {loading ? "REFRESHING…" : "↻ REFRESH WEEKLY TICKET"}
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
          <span>WEEKLY RULES</span>
          <ul>
            <li>✓ Current Monday-Sunday window only</li>
            <li>✓ Future pre-live games only</li>
            <li>✓ 60%+ model probability per leg</li>
            <li>✓ Probability outranks nominal value</li>
            <li>✓ Maximum two picks per calendar day</li>
            <li>✓ Maximum ten legs</li>
            <li>✓ One selection per event</li>
            <li>✓ Football, basketball and tennis eligible</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}
