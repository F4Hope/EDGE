import Link from "next/link";
import { ComboBuilder } from "@/components/ComboBuilder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { buildCombo } from "@/lib/combo/engine";
import { getComboCandidatePool } from "@/lib/data/uiCombos";
import { recordComboBuild } from "@/lib/data/comboAudit";

export const dynamic = "force-dynamic";

export default async function CombosPage() {
  let initialResult = null;
  let initialDiagnostics = null;
  let initialResearchQueue = null;

  try {
    const pool = await getComboCandidatePool();
    initialResult = buildCombo(pool.candidates, 2, "BALANCED");
    await recordComboBuild(initialResult).catch((error) => {
      console.error(
        "EDGE initial combo audit write failed.",
        error instanceof Error ? error.message : String(error),
      );
    });
    initialDiagnostics = pool.diagnostics;
    initialResearchQueue = pool.evidenceResearchQueue;
  } catch {
    initialResult = null;
    initialDiagnostics = null;
    initialResearchQueue = null;
  }

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="QUALITY FIRST / TARGET SECOND"
        title="Combo builder"
        description="Today’s Best balanced combo targeting 2x now rolls forward to the next playable pre-live events. Started matches are removed automatically, and new priced/model-qualified candidates are replenished during the day."
      />

      <div className="combo-pick-launch">
        <Link href="/combo-pick" className="combo-pick-launch-link">
          <span>⚡</span>
          <strong>OPEN TODAY’S COMBO PICK</strong>
          <b>Selections · stake · potential return →</b>
        </Link>
      </div>

      <ComboBuilder
        initialResult={initialResult}
        initialDiagnostics={initialDiagnostics}
        initialResearchQueue={initialResearchQueue}
      />

      <section className="principle-card compact-principle">
        <span className="principle-index">COMBO RULE</span>
        <p>DO NOT FORCE IT.</p>
        <span className="principle-note">
          If quality selections cannot reach the target, EDGE shows the strongest
          qualified best-effort combo instead of fabricating legs or prices.
        </span>
      </section>
    </MobileShell>
  );
}
