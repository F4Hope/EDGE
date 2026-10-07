import Link from "next/link";
import { ComboPickCard } from "@/components/ComboPickCard";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { buildCombo } from "@/lib/combo/engine";
import { recordComboBuild } from "@/lib/data/comboAudit";
import { getComboCandidatePool } from "@/lib/data/uiCombos";

export const dynamic = "force-dynamic";

export default async function ComboPickPage() {
  let initialResult = null;

  try {
    const pool = await getComboCandidatePool();
    initialResult = buildCombo(pool.candidates, 2, "BALANCED");
    await recordComboBuild(initialResult).catch((error) => {
      console.error(
        "EDGE Combo Pick audit write failed.",
        error instanceof Error ? error.message : String(error),
      );
    });
  } catch {
    initialResult = null;
  }

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="READY-TO-READ TICKET"
        title="Today’s Combo Pick"
        description="A simple rolling Combo ticket: selections, odds, your stake and potential return. Refresh whenever you want the latest qualified future events."
        action={
          <Link className="status-pill combo-builder-link" href="/combos">
            ADVANCED BUILDER
          </Link>
        }
      />

      <ComboPickCard initialResult={initialResult} />
    </MobileShell>
  );
}
