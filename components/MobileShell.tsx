import Link from "next/link";
import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { EdgeMark } from "./EdgeMark";

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="page-frame">
        <header className="topbar">
          <Link href="/" className="brand-link" aria-label="EDGE home">
            <EdgeMark />
          </Link>
          <Link className="icon-button" href="/more" aria-label="Open more">
            <span />
            <span />
            <span />
          </Link>
        </header>

        {children}
        <div className="bottom-spacer" />
      </div>

      <BottomNav />
    </main>
  );
}
