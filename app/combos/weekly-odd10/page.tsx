import Link from "next/link";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { WeeklyOdd10Card } from "@/components/WeeklyOdd10Card";

export const dynamic = "force-dynamic";

export default function WeeklyOdd10Page() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="WEEKLY / 75%+ / TARGET 10X"
        title="Weekly ODD 10"
        description="A separate Monday-to-Sunday ticket that targets combined decimal odds around 10.00 using only selections EDGE rates at 75% or higher, with stricter quality and agreement gates."
        action={
          <Link className="secondary-link" href="/combos/weekly">
            STANDARD WEEKLY →
          </Link>
        }
      />

      <WeeklyOdd10Card />

      <section className="principle-card compact-principle">
        <span className="principle-index">ODD 10 RULE</span>
        <p>75% FLOOR. QUALITY BEFORE PRICE.</p>
        <span className="principle-note">
          EDGE will show a lower best-available price rather than add a weak leg
          below the 75% threshold. Sports outcomes remain uncertain; this ticket
          is optimized for probability, not guaranteed to win.
        </span>
      </section>
    </MobileShell>
  );
}
