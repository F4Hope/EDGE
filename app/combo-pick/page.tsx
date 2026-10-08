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
        description="Two separate tickets at the same time: a strict LOW Combo and a BALANCED Combo using different events. Both are today-only and must reach at least 2.30 combined odds."
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
