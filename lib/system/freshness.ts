export type FreshnessState = "FRESH" | "AGING" | "STALE" | "EMPTY";

export type FreshnessDescriptor = {
  state: FreshnessState;
  ageMinutes: number | null;
};

export function describeFreshness(
  timestamp: string | Date | null,
  now: Date,
  freshMinutes: number,
  staleMinutes: number,
): FreshnessDescriptor {
  if (!timestamp) {
    return { state: "EMPTY", ageMinutes: null };
  }

  const observed = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (
    Number.isNaN(observed.getTime()) ||
    !Number.isFinite(freshMinutes) ||
    !Number.isFinite(staleMinutes) ||
    freshMinutes < 0 ||
    staleMinutes < freshMinutes
  ) {
    return { state: "EMPTY", ageMinutes: null };
  }

  const ageMinutes = Math.max(
    0,
    Math.floor((now.getTime() - observed.getTime()) / 60_000),
  );

  return {
    state:
      ageMinutes <= freshMinutes
        ? "FRESH"
        : ageMinutes <= staleMinutes
          ? "AGING"
          : "STALE",
    ageMinutes,
  };
}
