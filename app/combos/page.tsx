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
        description="EDGE opens with Today’s Best balanced combo targeting 2x from qualified model-supported selections and real stored bookmaker prices. Raise the target only when the evidence pool can support it."
      />

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
