import Link from "next/link";
import { MobileShell } from "@/components/MobileShell";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <MobileShell>
      <EmptyState
        status="404"
        title="This EDGE surface does not exist."
        description="The route may have moved or the requested event/resource is unavailable."
        action={<Link className="secondary-link" href="/">RETURN HOME →</Link>}
      />
    </MobileShell>
  );
}
