"use client";

import { useEffect, useMemo, useState } from "react";
import { ParticipantBadge } from "@/components/ParticipantBadge";
import { BetPawaBookingPanel } from "@/components/BetPawaBookingPanel";
import type { WeeklyOdd10Result } from "@/lib/combo/weeklyOdd10";
import type { ComboCandidateDiagnostics } from "@/lib/data/uiCombos";
import type { SupportedSport } from "@/lib/providers/types";

type ApiResponse = {
  data?: WeeklyOdd10Result;
  meta?: { candidateDiagnostics?: ComboCandidateDiagnostics };
  error?: string;
};

function localWeekWindow() {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const sunday = new Date(end.getTime() - 1);
  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    label: `${formatter.format(start)} – ${formatter.format(sunday)}`,
  };
}

function percent(value: number | null): string {
  if (value === null) return "—";
  if (value > 0 && value < 0.001) return "<0.1%";
  return `${(value * 100).toFixed(1)}%`;
}

function safeStake(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
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

export function WeeklyOdd10Card() {
  const [result, setResult] = useState<WeeklyOdd10Result | null>(null);
  const [diagnostics, setDiagnostics] = useState<ComboCandidateDiagnostics | null>(null);
  const [stake, setStake] = useState("100");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [weekLabel, setWeekLabel] = useState(() => localWeekWindow().label);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);

  const stakeValue = safeStake(stake);
  const potentialReturn =
    result?.actualOdds === null || result?.actualOdds === undefined
      ? 0
      : Number((stakeValue * result.actualOdds).toFixed(2));

  const grouped = useMemo(() => {
    const groups = new Map<string, WeeklyOdd10Result["legs"]>();
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

  async function refreshTicket() {
    setLoading(true);
    setError(null);
    try {
      const week = localWeekWindow();
      setWeekLabel(week.label);
      const response = await fetch("/api/combos/weekly-odd10", {
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
        throw new Error(payload.error ?? "Unable to build Weekly ODD 10.");
      }
      setResult(payload.data);
      setDiagnostics(payload.meta?.candidateDiagnostics ?? null);
      setUpdatedAt(new Date());
    } catch (caught) {
      setResult(null);
      setDiagnostics(null);
      setError(caught instanceof Error ? caught.message : "Unable to build Weekly ODD 10.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshTicket(), 0);
    const regular = window.setInterval(() => void refreshTicket(), 30 * 60 * 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(regular);
    };
  }, []);

  async function copyTicket() {
    if (!result?.legs.length) return;
    const text = [
      `EDGE WEEKLY ODD 10 · 75%+ ONLY · ${weekLabel}`,
      ...result.legs.map(
        (leg, index) =>
          `${index + 1}. ${leg.selectionName} — ${leg.matchup} @ ${leg.decimalOdds.toFixed(2)} · MODEL ${percent(leg.modelProbability)}`,
      ),
      `Combined odds: ${result.actualOdds?.toFixed(2) ?? "—"}`,
      `Estimated ticket probability: ${percent(result.estimatedProbability)}`,
      "No outcome is guaranteed.",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="weekly-combo-layout" aria-live="polite">
      <div className="weekly-combo-main">
        <div className="weekly-combo-hero weekly-odd10-hero">
          <div>
            <span>WEEKLY ODD 10 · 75%+ LEGS ONLY</span>
            <h2>High-Confidence 10x Ticket</h2>
            <p>{weekLabel} · probability first · target 10.00 odds</p>
          </div>
          <div className="weekly-combo-badge weekly-odd10-badge">
            <strong>{result?.actualOdds?.toFixed(1) ?? "10"}</strong>
            <span>TARGET</span>
          </div>
        </div>

        {result?.legs.length ? (
          <>
            <div className="weekly-combo-stats">
              <div><span>COMBINED ODDS</span><strong>{result.actualOdds?.toFixed(2) ?? "—"}</strong></div>
              <div><span>EST. TICKET PROB.</span><strong>{percent(result.estimatedProbability)}</strong></div>
              <div><span>LOWEST LEG</span><strong>{percent(result.minimumLegProbability)}</strong></div>
              <div><span>AVG LEG PROB.</span><strong>{percent(result.averageLegProbability)}</strong></div>
              <div><span>LEGS</span><strong>{result.legs.length}</strong></div>
              <div><span>75%+ CANDIDATES</span><strong>{result.candidateCount}</strong></div>
              <div><span>MODELED EVENTS</span><strong>{diagnostics?.eventsWithPredictions ?? "—"}</strong></div>
              <div><span>FUTURE EVENTS</span><strong>{diagnostics?.windowEvents ?? "—"}</strong></div>
            </div>

            <div className="weekly-odd10-warning">
              <strong>HIGH CONFIDENCE IS NOT A GUARANTEE.</strong>
              <span>
                Every leg is rated at least 75% by EDGE, but all legs still have
                to win. The combined ticket probability is shown above and is
                lower than the probability of each individual game.
              </span>
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
                        <ParticipantBadge participant={leg.homeParticipant} sport={leg.sport as SupportedSport} compact />
                        <ParticipantBadge participant={leg.awayParticipant} sport={leg.sport as SupportedSport} compact />
                      </div>
                      <div className="weekly-leg-copy">
                        <span>{leg.sport.toUpperCase()} · {leg.league} · {formatStart(leg.startsAt)}</span>
                        <strong>{leg.selectionName}</strong>
                        <p>{leg.matchup}</p>
                        <small>
                          {marketLabel(leg.marketKey)} · MODEL {percent(leg.modelProbability)} ·
                          QUALITY {percent(leg.dataQuality)} · AGREEMENT {percent(leg.modelAgreement)}
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
                    aria-label="Weekly ODD 10 bet amount in FCFA"
                  />
                </div>
              </label>
              <div>
                <span>POTENTIAL RETURN</span>
                <strong>FCFA {potentialReturn.toFixed(2)}</strong>
              </div>
              <button type="button" onClick={() => void copyTicket()}>
                {copied ? "✓ COPIED" : "⚡ COPY ODD 10 TICKET"}
              </button>
            </div>

            <BetPawaBookingPanel ticketKind="weekly-odd10" legs={result.legs} />
          </>
        ) : (
          <div className="combo-pick-empty">
            <strong>{loading ? "Analyzing 75%+ weekly candidates…" : "No qualifying Weekly ODD 10 ticket yet."}</strong>
            <p>EDGE will not lower the 75% probability floor just to manufacture a 10x ticket.</p>
          </div>
        )}

        {error ? <p className="combo-pick-error">{error}</p> : null}
      </div>

      <aside className="weekly-combo-side">
        <div className="combo-control-card">
          <span className="combo-control-label">ODD 10 ENGINE</span>
          <strong>≥75% per leg</strong>
          <p>80%+ data quality · 82%+ model agreement · no HIGH risk · one pick per event · target 10.00 without forced weak legs.</p>
          <button
            type="button"
            className="combo-refresh-button"
            onClick={() => void refreshTicket()}
            disabled={loading}
          >
            {loading ? "ANALYZING…" : "REFRESH WEEKLY ODD 10"}
          </button>
          <small>Updated {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
        </div>

        <div className="combo-why-card">
          <span>HOW EDGE CHOOSES</span>
          <ul>
            <li>✓ Every selected game ≥75% model probability</li>
            <li>✓ Stricter quality and agreement gates</li>
            <li>✓ Highest combined hit probability prioritized</li>
            <li>✓ 10x target is secondary to selection quality</li>
            <li>✓ No promise or guarantee of a win</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}
