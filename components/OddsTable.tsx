import type { UiOddsMarket } from "@/lib/data/uiOdds";

function pointLabel(point: number | null): string {
  if (point === null) return "";
  return point > 0 ? ` +${point}` : ` ${point}`;
}

export function OddsTable({ markets }: { markets: UiOddsMarket[] }) {
  return (
    <div className="odds-market-list">
      {markets.map((market) => (
        <article className="odds-market-card" key={market.id}>
          <div className="odds-market-head">
            <div>
              <span className="empty-status">{market.key.toUpperCase()}</span>
              <h3>{market.name}</h3>
            </div>
            <span className="count-badge">{market.quotes.length} CURRENT</span>
          </div>

          <div className="odds-quote-list">
            {market.quotes.length > 0 ? (
              market.quotes.map((quote) => (
                <div
                  className="odds-quote-row"
                  key={`${quote.bookmakerKey ?? "unknown"}:${quote.selectionKey}:${quote.point ?? "na"}`}
                >
                  <div>
                    <strong>
                      {quote.selectionName}
                      {pointLabel(quote.point)}
                    </strong>
                    <span>{quote.bookmakerName ?? quote.bookmakerKey ?? "Bookmaker"}</span>
                  </div>
                  <b>{quote.decimalOdds.toFixed(2)}</b>
                </div>
              ))
            ) : (
              <p className="odds-empty">No current bookmaker quote is stored.</p>
            )}
          </div>

          <div className="odds-market-foot">
            <span>{market.provider}</span>
            <span>{market.snapshotCount} STORED SNAPSHOTS</span>
          </div>
        </article>
      ))}
    </div>
  );
}
