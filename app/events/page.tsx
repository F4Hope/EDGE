import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { EventCard } from "@/components/EventCard";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiEvents } from "@/lib/data/uiEvents";
import {
  supportedSports,
  type SupportedSport,
} from "@/lib/providers/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseSport(value: string | undefined): SupportedSport | undefined {
  if (!value) return undefined;
  return supportedSports.includes(value as SupportedSport)
    ? (value as SupportedSport)
    : undefined;
}

function parseHours(value: string | undefined): number {
  if (value === "24") return 24;
  if (value === "48") return 48;
  if (value === "168") return 168;
  return 168;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sport = parseSport(first(params.sport));
  const hours = parseHours(first(params.hours));
  const state = await getUiEvents({ sport, hours, limit: 100 });

  const sportFilters = [
    { label: "All", href: `/events?hours=${hours}`, active: !sport },
    ...supportedSports.map((item) => ({
      label: item[0].toUpperCase() + item.slice(1),
      href: `/events?sport=${item}&hours=${hours}`,
      active: item === sport,
    })),
  ];

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="EVENT UNIVERSE"
        title="Events"
        description="Normalized upcoming events from connected providers. Analysis remains separate from event discovery."
      />

      <div className="filter-rail" aria-label="Sport filters">
        {sportFilters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            className={filter.active ? "filter-chip active" : "filter-chip"}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="window-switch" aria-label="Time window">
        {[24, 48, 168].map((value) => (
          <Link
            key={value}
            href={`/events?hours=${value}${sport ? `&sport=${sport}` : ""}`}
            className={hours === value ? "window-button active" : "window-button"}
          >
            {value === 168 ? "7 DAYS" : `${value}H`}
          </Link>
        ))}
      </div>

      <details className="filter-panel">
        <summary>ADVANCED FILTERS <span>+</span></summary>
        <div className="filter-panel-body">
          <div className="filter-field">
            <label>League / country</label>
            <input value="Available after event catalog expansion" disabled readOnly />
          </div>
          <div className="filter-field">
            <label>Market / odds</label>
            <input value="Unlocks in Phase 5" disabled readOnly />
          </div>
          <div className="filter-field">
            <label>EDGE score / risk / confidence</label>
            <input value="Unlocks after scoring models" disabled readOnly />
          </div>
          <div className="filter-field">
            <label>BetPawa availability</label>
            <input value="Unconfirmed until availability architecture" disabled readOnly />
          </div>
        </div>
      </details>

      <section className="list-section">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">UPCOMING</p>
            <h2>Normalized events</h2>
          </div>
          <span className="count-badge">
            {state.available ? `${state.events.length} FOUND` : "UNAVAILABLE"}
          </span>
        </div>

        {state.events.length > 0 ? (
          <div className="event-list">
            {state.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            status={state.available ? "NO EVENTS" : "DATA OFFLINE"}
            title={state.available ? "Nothing stored in this window." : "Event database unavailable."}
            description={
              state.message ??
              "Run the event sync after configuring your provider and database."
            }
          />
        )}
      </section>
    </MobileShell>
  );
}
