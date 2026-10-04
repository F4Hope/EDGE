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
  return 24;
}

function parseOdds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseMarket(
  value: string | undefined,
): "h2h" | "spreads" | "totals" | undefined {
  if (value === "h2h" || value === "spreads" || value === "totals") {
    return value;
  }
  return undefined;
}

function eventsHref(input: {
  hours: number;
  sport?: SupportedSport;
  coverage: "odds" | "all";
}): string {
  const params = new URLSearchParams();
  params.set("hours", String(input.hours));
  if (input.sport) params.set("sport", input.sport);
  if (input.coverage === "all") params.set("coverage", "all");
  return `/events?${params.toString()}`;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sport = parseSport(first(params.sport));
  const hours = parseHours(first(params.hours));
  const coverage = first(params.coverage) === "all" ? "all" : "odds";
  const league = first(params.league)?.trim() || undefined;
  const country = first(params.country)?.trim() || undefined;
  const market = parseMarket(first(params.market));
  const minOdds = parseOdds(first(params.minOdds));
  const maxOdds = parseOdds(first(params.maxOdds));

  const state = await getUiEvents({
    sport,
    hours,
    league,
    country,
    market,
    minOdds,
    maxOdds,
    requireOdds: coverage === "odds",
    limit: 100,
  });

  const sportFilters = [
    {
      label: "All",
      href: eventsHref({ hours, coverage }),
      active: !sport,
    },
    ...supportedSports.map((item) => ({
      label: item[0].toUpperCase() + item.slice(1),
      href: eventsHref({ sport: item, hours, coverage }),
      active: item === sport,
    })),
  ];

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="EVENT UNIVERSE"
        title="Events"
        description="The default feed contains upcoming events with stored bookmaker odds. Use All Fixtures only when you want to inspect uncovered provider fixtures."
      />

      <div className="window-switch" aria-label="Odds coverage">
        <Link
          href={eventsHref({ hours, sport, coverage: "odds" })}
          className={coverage === "odds" ? "window-button active" : "window-button"}
        >
          WITH ODDS
        </Link>
        <Link
          href={eventsHref({ hours, sport, coverage: "all" })}
          className={coverage === "all" ? "window-button active" : "window-button"}
        >
          ALL FIXTURES
        </Link>
      </div>

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
            href={eventsHref({ hours: value, sport, coverage })}
            className={hours === value ? "window-button active" : "window-button"}
          >
            {value === 168 ? "7 DAYS" : `${value}H`}
          </Link>
        ))}
      </div>

      <details
        className="filter-panel"
        open={Boolean(league || country || market || minOdds || maxOdds)}
      >
        <summary>ADVANCED FILTERS <span>+</span></summary>
        <form className="filter-panel-body" method="get">
          <input type="hidden" name="hours" value={hours} />
          <input type="hidden" name="coverage" value={coverage} />
          {sport ? <input type="hidden" name="sport" value={sport} /> : null}

          <div className="filter-field">
            <label htmlFor="league">League</label>
            <input
              id="league"
              name="league"
              defaultValue={league ?? ""}
              placeholder="e.g. Premier League"
            />
          </div>

          <div className="filter-field">
            <label htmlFor="country">Country</label>
            <input
              id="country"
              name="country"
              defaultValue={country ?? ""}
              placeholder="e.g. England"
            />
          </div>

          <div className="filter-field">
            <label htmlFor="market">Market</label>
            <select id="market" name="market" defaultValue={market ?? ""}>
              <option value="">Default H2H / Moneyline</option>
              <option value="h2h">Head to head / Moneyline</option>
              <option value="spreads">Spread / Handicap</option>
              <option value="totals">Totals / Over Under</option>
            </select>
          </div>

          <div className="filter-duo">
            <div className="filter-field">
              <label htmlFor="minOdds">Minimum odds</label>
              <input
                id="minOdds"
                name="minOdds"
                inputMode="decimal"
                defaultValue={minOdds ?? ""}
                placeholder="1.20"
              />
            </div>
            <div className="filter-field">
              <label htmlFor="maxOdds">Maximum odds</label>
              <input
                id="maxOdds"
                name="maxOdds"
                inputMode="decimal"
                defaultValue={maxOdds ?? ""}
                placeholder="5.00"
              />
            </div>
          </div>

          <button className="filter-submit" type="submit">
            APPLY MARKET FILTERS
          </button>

          <p className="filter-footnote">
            WITH ODDS hides fixtures without usable stored H2H prices. All Fixtures
            remains available for provider coverage inspection.
          </p>
        </form>
      </details>

      <section className="list-section">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">UPCOMING</p>
            <h2>{coverage === "odds" ? "Events with odds" : "All normalized fixtures"}</h2>
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
            title={
              state.available
                ? coverage === "odds"
                  ? "No priced events match this window."
                  : "Nothing matches this filter window."
                : "Event database unavailable."
            }
            description={
              state.message ??
              "Run the event and odds sync after configuring your provider and database."
            }
          />
        )}
      </section>
    </MobileShell>
  );
}
