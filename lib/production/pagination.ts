export type PageRequest = {
  limit: number;
  cursor: string | null;
};

export function parsePageRequest(
  searchParams: URLSearchParams,
  options?: {
    defaultLimit?: number;
    maxLimit?: number;
  },
): PageRequest {
  const defaultLimit = Math.max(1, options?.defaultLimit ?? 50);
  const maxLimit = Math.max(defaultLimit, options?.maxLimit ?? 250);
  const requested = Number(searchParams.get("limit") ?? defaultLimit);
  const limit = Number.isFinite(requested)
    ? Math.min(maxLimit, Math.max(1, Math.trunc(requested)))
    : defaultLimit;
  const cursor = searchParams.get("cursor")?.trim() || null;

  return { limit, cursor };
}
