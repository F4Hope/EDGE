import { ComboBuilder } from "@/components/ComboBuilder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { buildCombo } from "@/lib/combo/engine";
import { getComboCandidates } from "@/lib/data/uiCombos";

export const dynamic = "force-dynamic";

export default async function CombosPage() {
  let initialResult = null;

  try {
    const candidates = await getComboCandidates();
    initialResult = buildCombo(candidates, 5, "BALANCED");
  } catch {
    initialResult = null;
  }

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="QUALITY FIRST / TARGET SECOND"
        title="Combo builder"
        description="EDGE opens with the strongest available 5x balanced combo from qualified model-supported selections and real stored bookmaker prices. Change the target or risk mode to rebuild it."
      />

      <ComboBuilder initialResult={initialResult} />

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
