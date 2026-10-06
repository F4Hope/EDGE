import { ComboBuilder } from "@/components/ComboBuilder";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { buildCombo } from "@/lib/combo/engine";
import { getComboCandidatePool } from "@/lib/data/uiCombos";
import { recordComboBuild } from "@/lib/data/comboAudit";
import { calculateComboPerformance } from "@/lib/evaluation/comboPerformance";

export const dynamic = "force-dynamic";

export default async function CombosPage() {
  let initialResult = null;
  let initialDiagnostics = null;
  let initialResearchQueue = null;
  let comboPerformance = null;

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
    comboPerformance = await calculateComboPerformance();
  } catch {
    initialResult = null;
    initialDiagnostics = null;
    initialResearchQueue = null;
    comboPerformance = null;
  }

  const settledCount = comboPerformance?.settledRecommendations ?? 0;
  const hasSettledSample = settledCount > 0;

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

      <section>
        <ScreenHeader
          eyebrow="RECOMMENDATION AUDIT"
          title="Combo track record"
          description="Measured only from Combo outputs EDGE actually displayed and later settled. Page reload duplicates are collapsed before scoring."
        />
        <div className="metric-grid">
          <MetricPlaceholder
            label="SETTLED"
            value={String(settledCount)}
            note="Unique recommendations with a final win/loss"
            state={hasSettledSample ? "ready" : "pending"}
          />
          <MetricPlaceholder
            label="WINS"
            value={String(comboPerformance?.wins ?? 0)}
            note="Every leg resolved as a win"
            state={hasSettledSample ? "ready" : "pending"}
          />
          <MetricPlaceholder
            label="LOSSES"
            value={String(comboPerformance?.losses ?? 0)}
            note="At least one final losing leg"
            state={hasSettledSample ? "ready" : "pending"}
          />
          <MetricPlaceholder
            label="HIT RATE"
            value={
              comboPerformance?.hitRate === null ||
              comboPerformance?.hitRate === undefined
                ? "—"
                : `${(comboPerformance.hitRate * 100).toFixed(1)}%`
            }
            note={
              hasSettledSample
                ? `${comboPerformance?.uniqueRecommendations ?? 0} unique outputs tracked`
                : "Starts after displayed Combo recommendations settle"
            }
            state={hasSettledSample ? "ready" : "pending"}
          />
        </div>
      </section>

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
