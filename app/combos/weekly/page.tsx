import Link from "next/link";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { WeeklyComboCard } from "@/components/WeeklyComboCard";

export const dynamic = "force-dynamic";

export default function WeeklyCombosPage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="WEEKLY / PROBABILITY FIRST"
        title="Weekly Combo"
        description="A Monday-to-Sunday cumulative ticket built from the highest-probability qualified future selections remaining in the current week. It automatically rolls into a fresh week every Monday."
        action={
          <Link className="secondary-link" href="/combos">
            COMBO BUILDER →
          </Link>
        }
      />

      <WeeklyComboCard />

      <section className="principle-card compact-principle">
        <span className="principle-index">WEEKLY RULE</span>
        <p>QUALIFY FIRST. COUNT SECOND.</p>
        <span className="principle-note">
          EDGE does not impose a daily or weekly leg quota. Every event that
          independently passes the weekly gates is included, while cumulative
          ticket probability still falls as more legs must all win.
        </span>
      </section>
    </MobileShell>
  );
}
