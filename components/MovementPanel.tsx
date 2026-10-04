import type { UiMovementMarket } from "@/lib/data/uiMovement";

function pct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

export function MovementPanel({
  markets,
}: {
  markets: UiMovementMarket[];
}) {
  const rows = markets.flatMap((market) =>
    market.summary.movements.map((movement) => ({
      market,
      movement,
    })),
  );

  return (
    <div className="movement-list">
      {rows.slice(0, 20).map(({ market, movement }) => (
        <article
          className="movement-item"
          key={`${market.marketId}:${movement.bookmakerKey ?? "unknown"}:${movement.selectionKey}:${movement.point ?? "na"}`}
        >
          <div className="movement-head">
            <div>
              <span className="empty-status">{market.marketKey.toUpperCase()}</span>
              <h3>{movement.selectionName}</h3>
            </div>
            <span className={movement.rapid ? "movement-flag" : "movement-direction"}>
              {movement.rapid ? "RAPID" : movement.direction}
            </span>
          </div>
          <div className="movement-metrics">
            <div><span>OPEN</span><strong>{movement.openingOdds.toFixed(2)}</strong></div>
            <div><span>CURRENT</span><strong>{movement.currentOdds.toFixed(2)}</strong></div>
            <div><span>IMPLIED Δ</span><strong>{pct(movement.impliedProbabilityChange)}</strong></div>
          </div>
          <p>
            Descriptive market movement only. A price move is not treated as evidence
            that an outcome is more likely to win.
          </p>
        </article>
      ))}
    </div>
  );
}
