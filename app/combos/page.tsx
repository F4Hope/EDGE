import { ComboBuilderPreview } from "@/components/ComboBuilderPreview";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function CombosPage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="QUALITY FIRST / TARGET SECOND"
        title="Combo builder"
        description="Set a target and risk mode. EDGE will eventually construct only combinations supported by individually qualified opportunities and correlation checks."
      />

      <ComboBuilderPreview />

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
