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
    initialResult = buildCombo(candidates, 2, "BALANCED");
  } catch {
    initialResult = null;
  }

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="QUALITY FIRST / TARGET SECOND"
        title="Combo builder"
        description="EDGE opens with Today’s Best balanced combo targeting 2x from qualified model-supported selections and real stored bookmaker prices. Raise the target only when the evidence pool can support it."
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
