import Link from "next/link";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getSystemReadiness } from "@/lib/system/readiness";
import { buildSetupPlan } from "@/lib/system/setup";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const readiness = await getSystemReadiness();
  const plan = buildSetupPlan(readiness);

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="LIVE DATA SETUP"
        title="Setup Center"
        description="A plain-language checklist for database, provider access, stored events, and feature readiness. Secret values are never displayed."
        action={
          <Link className="secondary-link" href="/status">
            SYSTEM STATUS →
          </Link>
        }
      />

      <section className="setup-progress-card">
        <div>
          <span className="empty-status">SETUP COMPLETION</span>
          <strong>{plan.percent}%</strong>
        </div>
        <div className="setup-progress-track" aria-label={"Setup " + plan.percent + "% complete"}>
          <i style={{ width: plan.percent + "%" }} />
        </div>
        <p>
          {plan.completed} of {plan.total} live-data setup steps are ready.
          This percentage measures configuration/evidence readiness only; it is
          not a model-confidence or prediction-quality score.
        </p>
      </section>

      <section className="setup-step-list">
        {plan.steps.map((step, index) => (
          <article className="setup-step" key={step.key}>
            <div className="setup-step-index">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="setup-step-copy">
              <div>
                <strong>{step.title}</strong>
                <span className={"setup-step-state " + step.state.toLowerCase()}>
                  {step.state}
                </span>
              </div>
              <p>{step.detail}</p>
              {step.action ? <small>{step.action}</small> : null}
            </div>
          </article>
        ))}
      </section>

      <section className="security-note">
        <span className="empty-status">NEXT ACTION</span>
        <h2>{plan.nextAction ? "One step at a time." : "Live-data setup is complete."}</h2>
        <p>
          {plan.nextAction ??
            "All five setup checks are ready. Use System Status to monitor freshness and pipeline health."}
        </p>
      </section>

      <section className="security-note">
        <span className="empty-status">SECRETS</span>
        <h2>Nothing sensitive is shown here.</h2>
        <p>
          EDGE only checks whether credentials exist. API keys, passwords, and
          database connection strings remain server-side.
        </p>
      </section>
    </MobileShell>
  );
}
