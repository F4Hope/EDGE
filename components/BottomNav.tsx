import Link from "next/link";

type IconName = "home" | "picks" | "combos" | "history";

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
  return <svg {...common}><path d="M4 5h16v15H4z"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m8.5 15 2 2 5-5"/></svg>;
}

const items: Array<{ label: string; href: string; icon: IconName; active?: boolean }> = [
  { label: "Home", href: "/", icon: "home", active: true },
  { label: "Picks", href: "/opportunities", icon: "picks" },
  { label: "Combos", href: "/combos", icon: "combos" },
  { label: "History", href: "/history", icon: "history" },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={item.active ? "nav-item active" : "nav-item"}
          aria-current={item.active ? "page" : undefined}
        >
          <NavIcon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
