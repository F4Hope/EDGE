"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComboCandidate } from "@/lib/combo/engine";
import type {
  BetPawaBookingResult,
  BetPawaTicketKind,
} from "@/lib/integrations/betPawaBooking";

type ApiResponse = {
  data?: BetPawaBookingResult;
  error?: string;
};

function bookingPayload(
  ticketKind: BetPawaTicketKind,
  legs: ComboCandidate[],
): string | null {
  if (legs.length < 2) return null;

  return JSON.stringify({
    ticketKind,
    legs: legs.map((leg) => ({
      eventId: leg.eventId,
      sport: leg.sport,
      league: leg.league,
      startsAt: leg.startsAt,
      matchup: leg.matchup,
      marketKey: leg.marketKey,
      point: leg.point,
      selectionKey: leg.selectionKey,
      selectionName: leg.selectionName,
      decimalOdds: leg.decimalOdds,
    })),
  });
}

export function BetPawaBookingPanel({
  ticketKind,
  legs,
}: {
  ticketKind: BetPawaTicketKind;
  legs: ComboCandidate[];
}) {
  const payload = useMemo(
    () => bookingPayload(ticketKind, legs),
    [ticketKind, legs],
  );
  const [result, setResult] = useState<BetPawaBookingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualCopied, setManualCopied] = useState(false);
  const [manualAllCopied, setManualAllCopied] = useState(false);
  const [manualIndex, setManualIndex] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!payload) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setResult(null);

      void fetch("/api/betpawa/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: payload,
      })
        .then(async (response) => {
          const body = (await response.json()) as ApiResponse;
          if (!response.ok || !body.data) {
            throw new Error(body.error ?? "BetPawa booking code is unavailable.");
          }
          setResult(body.data);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setResult({
            status: "UNAVAILABLE",
            bookingCode: null,
            loadUrl: null,
            matchedLegCount: 0,
            unmatchedLegs: [],
            message:
              error instanceof Error
                ? error.message
                : "BetPawa booking code is unavailable.",
          });
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [payload, retryNonce]);

  async function copyCode() {
    if (!result?.bookingCode) return;
    await navigator.clipboard.writeText(result.bookingCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function marketLabel(key: string): string {
    if (key === "h2h") return "MATCH WINNER / 1X2";
    if (key === "totals") return "OVER / UNDER";
    if (key === "spreads") return "HANDICAP / SPREAD";
    if (key === "double_chance") return "DOUBLE CHANCE";
    return key.replaceAll("_", " ").toUpperCase();
  }

  function searchUrl(leg: ComboCandidate): string {
    const [home, away] = leg.matchup.split(/\s+vs\s+/i);
    const query = home && away ? home + " " + away : leg.matchup;
    return (
      "https://www.betpawa.cm/search?searchQuery=" +
      encodeURIComponent(query)
    );
  }

  function manualPickText(leg: ComboCandidate, index: number): string {
    const point =
      leg.point === null || leg.point === undefined
        ? ""
        : " · Line " + String(leg.point);
    return [
      "EDGE BETPAWA PICK " + String(index + 1) + "/" + String(legs.length),
      leg.matchup,
      "Pick: " + leg.selectionName,
      "Market: " + marketLabel(leg.marketKey) + point,
      "EDGE odds reference: " + leg.decimalOdds.toFixed(2),
    ].join("\n");
  }

  async function copyManualPick() {
    const leg = legs[manualIndex];
    if (!leg) return;
    await navigator.clipboard.writeText(manualPickText(leg, manualIndex));
    setManualCopied(true);
    window.setTimeout(() => setManualCopied(false), 1600);
  }

  async function copyAllManualPicks() {
    const text = [
      "EDGE BETPAWA CAMEROON ENTRY LIST",
      ...legs.map((leg, index) => manualPickText(leg, index)),
    ].join("\n\n");
    await navigator.clipboard.writeText(text);
    setManualAllCopied(true);
    window.setTimeout(() => setManualAllCopied(false), 1600);
  }

  if (!payload) return null;

  return (
    <section className="betpawa-booking-card" aria-live="polite">
      <div className="betpawa-booking-head">
        <div>
          <span>BETPAWA BOOKING CODE</span>
          <strong>
            {loading
              ? "Generating real BetPawa code…"
              : result?.status === "READY"
                ? "Ready to copy"
                : "Booking-code export"}
          </strong>
        </div>
        <b>{legs.length} LEGS</b>
      </div>

      {result?.status === "READY" && result.bookingCode ? (
        <>
          <div className="betpawa-code-box">
            <code>{result.bookingCode}</code>
            <button type="button" onClick={() => void copyCode()}>
              {copied ? "✓ COPIED" : "COPY CODE"}
            </button>
          </div>
          <p>
            All {result.matchedLegCount} EDGE selections were matched before this
            code was exposed. BetPawa can re-price or close markets before you
            load the slip.
          </p>
          <div className="betpawa-booking-actions">
            {result.loadUrl ? (
              <a href={result.loadUrl} target="_blank" rel="noreferrer">
                OPEN BETPAWA →
              </a>
            ) : null}
            <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>
              ↻ REFRESH CODE
            </button>
          </div>
        </>
      ) : result?.status === "NOT_CONFIGURED" ? (
        <>
          <div className="betpawa-manual-head">
            <div>
              <span>BETPAWA CAMEROON · MANUAL LOAD MODE</span>
              <strong>
                Pick {Math.min(manualIndex + 1, legs.length)} of {legs.length}
              </strong>
            </div>
            <button type="button" onClick={() => void copyAllManualPicks()}>
              {manualAllCopied ? "✓ ALL COPIED" : "COPY ALL PICKS"}
            </button>
          </div>

          {legs[manualIndex] ? (
            <div className="betpawa-manual-pick">
              <span>{marketLabel(legs[manualIndex].marketKey)}</span>
              <strong>{legs[manualIndex].selectionName}</strong>
              <p>{legs[manualIndex].matchup}</p>
              {legs[manualIndex].point !== null ? (
                <small>LINE {legs[manualIndex].point}</small>
              ) : null}
              <small>
                EDGE ODDS REF {legs[manualIndex].decimalOdds.toFixed(2)} · BetPawa
                may show a different current price.
              </small>
            </div>
          ) : null}

          <div className="betpawa-booking-actions betpawa-manual-actions">
            {legs[manualIndex] ? (
              <a
                href={searchUrl(legs[manualIndex])}
                target="_blank"
                rel="noreferrer"
              >
                OPEN THIS MATCH ON BETPAWA →
              </a>
            ) : null}
            <button type="button" onClick={() => void copyManualPick()}>
              {manualCopied ? "✓ PICK COPIED" : "COPY THIS PICK"}
            </button>
          </div>

          <div className="betpawa-manual-nav">
            <button
              type="button"
              disabled={manualIndex === 0}
              onClick={() => setManualIndex((value) => Math.max(0, value - 1))}
            >
              ← PREVIOUS
            </button>
            <div>
              <span>{manualIndex + 1}</span>
              <i>/</i>
              <strong>{legs.length}</strong>
            </div>
            <button
              type="button"
              disabled={manualIndex >= legs.length - 1}
              onClick={() =>
                setManualIndex((value) => Math.min(legs.length - 1, value + 1))
              }
            >
              I ADDED IT · NEXT →
            </button>
          </div>

          <p className="betpawa-booking-message">
            Open the match, add the exact selection shown above, return to EDGE,
            then tap <strong>I ADDED IT · NEXT</strong>. After the final leg,
            use BetPawa&apos;s own Booking Code / Share Betslip control to create
            the real code.
          </p>
        </>
      ) : (
        <>
          <p className="betpawa-booking-message">
            {loading
              ? "EDGE is matching this ticket against the BetPawa booking connector."
              : result?.message ??
                "EDGE is preparing the BetPawa booking-code request."}
          </p>
          {result?.unmatchedLegs.length ? (
            <div className="betpawa-unmatched">
              <span>UNMATCHED LEGS</span>
              <ul>
                {result.unmatchedLegs.slice(0, 6).map((leg) => (
                  <li key={leg}>{leg}</li>
                ))}
              </ul>
              {result.unmatchedLegs.length > 6 ? (
                <small>
                  +{result.unmatchedLegs.length - 6} additional unmatched legs
                </small>
              ) : null}
            </div>
          ) : null}
          {!loading ? (
            <div className="betpawa-booking-actions">
              {result?.loadUrl ? (
                <a href={result.loadUrl} target="_blank" rel="noreferrer">
                  OPEN BETPAWA →
                </a>
              ) : null}
              {result?.status === "UNAVAILABLE" ? (
                <button
                  type="button"
                  onClick={() => setRetryNonce((value) => value + 1)}
                >
                  ↻ RETRY CODE
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
