import Link from "next/link";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

export const dynamic = "force-dynamic";

function ConfigRow({
  label,
  configured,
  note,
}: {
  label: string;
  configured: boolean;
  note: string;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <span>{note}</span>
      </div>
      <span className={configured ? "config-state configured" : "config-state"}>
        <i />
        {configured ? "CONFIGURED" : "NOT SET"}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const apiSportsConfigured = Boolean(process.env.API_SPORTS_KEY);
  const oddsApiConfigured = Boolean(process.env.ODDS_API_KEY);
  const strategy = process.env.SPORTS_DATA_PROVIDER ?? "auto";

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="SYSTEM"
        title="Configuration"
        description="Configuration status only. Secret values are never rendered to the browser."
        action={
          <Link className="secondary-link" href="/status">
            LIVE STATUS →
          </Link>
        }
      />

      <section className="settings-card">
        <ConfigRow
          label="PostgreSQL"
          configured={databaseConfigured}
          note="Event, odds, feature, audit, and intelligence database"
        />
        <ConfigRow
          label="API-Sports"
          configured={apiSportsConfigured}
          note="Football / basketball event source"
        />
        <ConfigRow
          label="The Odds API"
          configured={oddsApiConfigured}
          note="Multi-sport event and featured-market odds source"
        />

        <div className="setting-row">
          <div>
            <strong>Provider strategy</strong>
            <span>Server-side routing preference</span>
          </div>
          <span className="plain-config">{strategy.toUpperCase()}</span>
        </div>
      </section>

      <section className="security-note">
        <span className="empty-status">SECURITY</span>
        <h2>Keys stay server-side.</h2>
        <p>
          Store real credentials in <code>.env.local</code>. EDGE does not display,
          transmit to client components, or commit provider secrets.
        </p>
      </section>
    </MobileShell>
  );
}
