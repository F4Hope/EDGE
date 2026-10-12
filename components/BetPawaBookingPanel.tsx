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

function bridgeUrl(legs: ComboCandidate[]): string | null {
  if (legs.length < 2) return null;

  const compact = legs.map((leg) => ({
    matchup: leg.matchup,
    marketKey: leg.marketKey,
    point: leg.point,
    selectionKey: leg.selectionKey,
    selectionName: leg.selectionName,
  }));
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, legs: compact }));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  return `https://www.betpawa.cm/#edgeTicket=${encoded}`;
}

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
  const handoffUrl = useMemo(() => bridgeUrl(legs), [legs]);
  const [result, setResult] = useState<BetPawaBookingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
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
              {result?.status === "NOT_CONFIGURED" && handoffUrl ? (
                <a href={handoffUrl} target="_blank" rel="noreferrer">
                  OPEN BETPAWA WITH PICKS →
                </a>
              ) : result?.loadUrl ? (
                <a href={result.loadUrl} target="_blank" rel="noreferrer">
                  OPEN BETPAWA →
                </a>
              ) : null}
              {result?.status === "NOT_CONFIGURED" ? (
                <small className="betpawa-bridge-note">
                  Requires the one-time EDGE BetPawa Cameroon browser bridge.
                </small>
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
