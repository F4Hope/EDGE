"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "home" | "picks" | "combos" | "history" | "more";

function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "home") {
    return <svg {...common}><path d="m3 10.8 9-7.2 9 7.2"/><path d="M5.4 9.6V21h13.2V9.6"/><path d="M9.4 21v-6.3h5.2V21"/></svg>;
  }
  if (name === "picks") {
    return <svg {...common}><path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/><path d="M3 19h18"/></svg>;
  }
  if (name === "combos") {
    return <svg {...common}><path d="M7 7h10v10H7z"/><path d="M4 4h10"/><path d="M4 4v10"/><path d="M10 20h10V10"/></svg>;
  }
  if (name === "history") {
    return <svg {...common}><path d="M4 5h16v15H4z"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m8.5 15 2 2 5-5"/></svg>;
  }
  return <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
}

const items: Array<{
  label: string;
  href: string;
  icon: IconName;
  matches: (pathname: string) => boolean;
}> = [
  { label: "Home", href: "/", icon: "home", matches: (path) => path === "/" },
  {
    label: "Picks",
    href: "/opportunities",
    icon: "picks",
    matches: (path) => path.startsWith("/opportunities") || path.startsWith("/analysis"),
  },
  { label: "Combos", href: "/combos", icon: "combos", matches: (path) => path.startsWith("/combos") },
  { label: "History", href: "/history", icon: "history", matches: (path) => path.startsWith("/history") },
  {
    label: "More",
    href: "/more",
    icon: "more",
    matches: (path) =>
      path.startsWith("/more") ||
      path.startsWith("/events") ||
      path.startsWith("/model") ||
      path.startsWith("/status") ||
      path.startsWith("/settings"),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="bottom-nav"
      aria-label="Primary navigation"
      style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
    >
      {items.map((item) => {
        const active = item.matches(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={active ? "nav-item active" : "nav-item"}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
