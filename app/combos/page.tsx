import { ComboBuilder } from "@/components/ComboBuilder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function CombosPage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="QUALITY FIRST / TARGET SECOND"
        title="Combo builder"
        description="Choose the target odds and risk mode. EDGE will construct a best-supported combination from stored pre-event Phase 7 forecasts and bookmaker odds, or explicitly refuse the target when evidence is insufficient."
      />

      <ComboBuilder />

      <section className="principle-card compact-principle">
        <span className="principle-index">COMBO RULE</span>
        <p>DO NOT FORCE IT.</p>
        <span className="principle-note">
          If quality selections cannot reach the target, the correct output remains NO BET.
        </span>
      </section>
    </MobileShell>
  );
}
