import { BottomNav } from "@/components/BottomNav";
import { EdgeMark } from "@/components/EdgeMark";
import { EdgeScore } from "@/components/EdgeScore";

const sports = [
  { label: "Football", code: "FT", note: "Provider connection pending" },
  { label: "Basketball", code: "BK", note: "Provider connection pending" },
  { label: "Tennis", code: "TN", note: "Provider connection pending" },
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="page-frame">
        <header className="topbar">
          <EdgeMark />
          <button className="icon-button" type="button" aria-label="Open settings">
            <span />
            <span />
            <span />
          </button>
        </header>

        <section className="hero-section" aria-labelledby="todays-edge-title">
          <div className="eyebrow-row">
            <p className="eyebrow" id="todays-edge-title">TODAY&apos;S EDGE</p>
            <span className="data-state"><i /> PRE-LIVE</span>
          </div>

          <article className="hero-card">
            <div className="hero-card-topline">
              <span>MARKET INTELLIGENCE</span>
              <span>01</span>
            </div>

            <div className="hero-content">
              <EdgeScore status="NO BET" />

              <div className="hero-copy">
                <p className="hero-overline">DATA GATE ACTIVE</p>
                <h1>No live market data connected.</h1>
                <p className="hero-description">
                  EDGE will not manufacture a recommendation. Connect verified sports and odds providers before any opportunity receives a score.
                </p>

                <div className="metric-strip" aria-label="Current analysis state">
                  <div>
                    <span>MODEL</span>
                    <strong>WAITING</strong>
                  </div>
                  <div>
                    <span>BETPAWA</span>
                    <strong>UNCONFIRMED</strong>
                  </div>
                  <div>
                    <span>RISK</span>
                    <strong>BLOCKED</strong>
                  </div>
                </div>

                <button className="primary-button" type="button" disabled>
                  VIEW ANALYSIS <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </article>
        </section>

        <section className="opportunities-section" aria-labelledby="top-opportunities-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">INTELLIGENCE QUEUE</p>
              <h2 id="top-opportunities-title">Top opportunities</h2>
            </div>
            <span className="count-badge">0 QUALIFIED</span>
          </div>

          <div className="opportunity-rail">
            {sports.map((sport) => (
              <article className="opportunity-card" key={sport.label}>
                <div className="sport-code">{sport.code}</div>
                <div className="opportunity-copy">
                  <span>{sport.label}</span>
                  <strong>No qualified opportunity</strong>
                  <p>{sport.note}</p>
                </div>
                <div className="card-score">—</div>
              </article>
            ))}
          </div>
        </section>

        <section className="principle-card" aria-label="EDGE operating principle">
          <span className="principle-index">EDGE / 001</span>
          <p>QUALITY FIRST.</p>
          <p>DATA FIRST.</p>
          <p className="muted-line">DISCIPLINE FIRST.</p>
          <span className="principle-note">No evidence. No bet.</span>
        </section>

        <div className="bottom-spacer" />
      </div>

      <BottomNav />
    </main>
  );
}
