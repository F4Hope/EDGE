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
        description="Today means today. Two separate tickets at the same time: LOW targets 2.30 but shows the strongest qualified fallback if that target cannot be reached; BALANCED uses different events and remains strict at 2.30+."
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
