import Link from "next/link";
import { EdgeScore } from "@/components/EdgeScore";
import { MobileShell } from "@/components/MobileShell";

const sports = [
  { label: "Football", code: "FT", note: "Awaiting odds + scoring" },
  { label: "Basketball", code: "BK", note: "Awaiting odds + scoring" },
  { label: "Tennis", code: "TN", note: "Awaiting odds + scoring" },
];

export default function HomePage() {
  return (
    <MobileShell>
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
              <h1>No scored market opportunity yet.</h1>
              <p className="hero-description">
                Event ingestion is ready. EDGE will not manufacture odds, model probability,
                estimated value, or a recommendation before those engines are connected.
              </p>

              <div className="metric-strip" aria-label="Current analysis state">
                <div><span>EVENTS</span><strong>READY</strong></div>
                <div><span>ODDS</span><strong>PENDING</strong></div>
                <div><span>MODEL</span><strong>WAITING</strong></div>
              </div>

              <Link className="primary-link" href="/events">
                BROWSE EVENTS <span aria-hidden="true">→</span>
              </Link>
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
          <span className="count-badge">NOT SCORED</span>
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
    </MobileShell>
  );
}
