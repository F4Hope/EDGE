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
        <p>LONGER DOES NOT MEAN WEAKER.</p>
        <span className="principle-note">
          EDGE will leave a day uncovered rather than insert a low-probability
          leg. Cumulative tickets multiply risk across legs; no weekly ticket is
          guaranteed to win.
        </span>
      </section>
    </MobileShell>
  );
}
