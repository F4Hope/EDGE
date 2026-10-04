import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiRequestError, apiJson } from "./api";

const SAFE_OPAQUE_ID = /^[A-Za-z0-9_-]+$/;
const MAX_OPAQUE_ID_LENGTH = 128;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 120;
const MAX_BUCKETS = 5_000;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let operationsSincePrune = 0;

function clientKey(request: Pick<NextRequest, "headers">): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  const candidate =
    forwarded?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    "anonymous";

  const bounded = candidate.length <= 96 ? candidate : candidate.slice(0, 96);
  return createHash("sha256").update(bounded).digest("hex").slice(0, 24);
}

function pruneBuckets(now: number) {
  operationsSincePrune += 1;
  if (operationsSincePrune < 100 && buckets.size < MAX_BUCKETS) return;

  operationsSincePrune = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  if (buckets.size <= MAX_BUCKETS) return;

  const overflow = buckets.size - MAX_BUCKETS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

export function requireOpaqueId(
  value: string | null | undefined,
  label = "id",
): string {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new ApiRequestError(label + " is required.", 400);
  }

  if (
    normalized.length > MAX_OPAQUE_ID_LENGTH ||
    !SAFE_OPAQUE_ID.test(normalized)
  ) {
    throw new ApiRequestError("Invalid " + label + ".", 400);
  }

  return normalized;
}

export function enforcePublicReadRateLimit(
  request: Pick<NextRequest, "headers">,
  requestId: string,
  route: string,
  options: {
    limit?: number;
    windowMs?: number;
  } = {},
) {
  const now = Date.now();
  const limit = Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT));
  const windowMs = Math.max(1_000, Math.trunc(options.windowMs ?? DEFAULT_WINDOW_MS));
  const key = route + ":" + clientKey(request);

  pruneBuckets(now);

  const existing = buckets.get(key);
  const bucket =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : existing;

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= limit) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1_000),
  );

  return apiJson(
    requestId,
    {
      error: "Too many requests. Try again later.",
      requestId,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1_000)),
      },
    },
  );
}

export function clearRateLimitStateForTests() {
  buckets.clear();
  operationsSincePrune = 0;
}
