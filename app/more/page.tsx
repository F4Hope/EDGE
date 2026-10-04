import Link from "next/link";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

const links = [
  {
    href: "/events",
    index: "01",
    title: "Events",
    copy: "Browse normalized Football, Basketball, and Tennis events.",
  },
  {
    href: "/model",
    index: "02",
    title: "Model performance",
    copy: "Audit calibration and accuracy when real settled history exists.",
  },
  {
    href: "/status",
    index: "03",
    title: "System status",
    copy: "Check live readiness, stored evidence, and configuration health.",
  },
  {
    href: "/settings",
    index: "04",
    title: "Configuration",
    copy: "Check provider configuration without exposing secrets.",
  },
];

export default function MorePage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="EDGE SYSTEM"
        title="More"
        description="Secondary intelligence, audit, readiness, and configuration surfaces."
      />

      <div className="utility-list">
        {links.map((item) => (
          <Link href={item.href} className="utility-link" key={item.href}>
            <span>{item.index}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.copy}</p>
            </div>
            <em>→</em>
          </Link>
        ))}
      </div>

      <section className="security-note">
        <span className="empty-status">OPERATING PRINCIPLE</span>
        <h2>Numbers over emotion.</h2>
        <p>
          EDGE communicates uncertainty explicitly and remains willing to return NO BET
          when evidence is insufficient.
        </p>
      </section>
    </MobileShell>
  );
}
