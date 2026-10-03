type EdgeScoreProps = {
  score?: number;
  status: "BETTABLE" | "WATCH" | "HIGH RISK" | "NO BET";
};

export function EdgeScore({ score, status }: EdgeScoreProps) {
  const clamped = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  const hasScore = typeof score === "number";

  return (
    <div className="score-cluster">
      <div
        className="score-ring"
        style={{ "--score": `${clamped * 3.6}deg` } as React.CSSProperties}
        aria-label={hasScore ? `EDGE Score ${clamped} out of 100` : "EDGE Score unavailable"}
      >
        <div className="score-core">
          <span className="score-kicker">EDGE</span>
          <strong>{hasScore ? clamped : "—"}</strong>
          <span className="score-denominator">/ 100</span>
        </div>
      </div>
      <span className={`status-pill ${status === "NO BET" ? "no-bet" : ""}`}>{status}</span>
    </div>
  );
}
