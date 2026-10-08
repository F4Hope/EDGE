import Link from "next/link";
import { ComboPickCard } from "@/components/ComboPickCard";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

export const dynamic = "force-dynamic";

export default function ComboPickPage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="READY-TO-READ TICKET"
        title="Today’s Combo Pick"
        description="Today means today: EDGE only uses qualified events scheduled for your current local calendar day. Tomorrow, the page automatically moves to tomorrow’s games."
        action={
          <Link className="status-pill combo-builder-link" href="/combos">
            ADVANCED BUILDER
          </Link>
        }
      />

      <ComboPickCard initialResult={null} />
    </MobileShell>
  );
}
