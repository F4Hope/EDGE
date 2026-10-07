import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { LeagueBestPicks } from "@/components/LeagueBestPicks";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiOpportunities } from "@/lib/data/uiOpportunities";
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

function bestPicksHref(sport?: SupportedSport): string {
  return sport ? `/best-picks?sport=${sport}` : "/best-picks";
}

export default async function BestPicksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sport = parseSport(first(params.sport));
  const state = await getUiOpportunities({
    sport,
    hours: 168,
    limit: 50,
  });

  const pickCount = state.bestPicksByLeague.reduce(
    (total, group) => total + group.picks.length,
    0,
  );

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="LEAGUE INTELLIGENCE"
        title="Best picks by league"
        description="EDGE ranks up to three distinct qualified games per league across the next seven days. It shows fewer when the evidence does not support a second or third selection."
        action={
          <span
            className={
              pickCount > 0 ? "status-pill" : "status-pill no-bet"
            }
          >
            {pickCount > 0 ? `${pickCount} PICKS` : "NO BET"}
          </span>
        }
      />

      <div className="filter-rail" aria-label="Best pick filters">
        <Link
          className={!sport ? "filter-chip active" : "filter-chip"}
          href={bestPicksHref()}
        >
          ALL
        </Link>
        {supportedSports.map((item) => (
          <Link
            key={item}
            className={sport === item ? "filter-chip active" : "filter-chip"}
            href={bestPicksHref(item)}
          >
            {item.toUpperCase()}
          </Link>
        ))}
        <Link className="filter-chip" href="/opportunities">
          ALL PICKS
        </Link>
      </div>

      <section className="opportunity-readiness">
        <div>
          <span>LEAGUES</span>
          <strong>{state.bestPicksByLeague.length}</strong>
          <small>With at least one qualified game</small>
        </div>
        <div>
          <span>BEST PICKS</span>
          <strong>{pickCount}</strong>
          <small>Maximum three per league</small>
        </div>
        <div>
          <span>PERIOD</span>
          <strong>7 DAYS</strong>
          <small>Pre-live opportunity window</small>
        </div>
      </section>

      {state.available ? (
        <LeagueBestPicks groups={state.bestPicksByLeague} />
      ) : (
        <EmptyState
          status="DATA OFFLINE"
          title="Best-pick data is unavailable."
          description={
            state.message ??
            "EDGE could not load the current opportunity pool."
          }
          action={
            <Link className="secondary-link" href="/events">
              BROWSE EVENTS →
            </Link>
          }
        />
      )}
    </MobileShell>
  );
}
