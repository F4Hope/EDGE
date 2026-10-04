import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function getRequestId(request?: Pick<NextRequest, "headers">): string {
  const supplied = request?.headers.get("x-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

export function apiHeaders(
  requestId: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ...extra,
    "X-Request-ID": requestId,
  };
}

export function apiJson<T>(
  requestId: string,
  body: T,
  init: {
    status?: number;
    headers?: Record<string, string>;
  } = {},
) {
  return NextResponse.json(body, {
    status: init.status,
    headers: apiHeaders(requestId, init.headers),
  });
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : null;
}

export function apiFailure(
  route: string,
  requestId: string,
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 500,
) {
  if (error instanceof ApiRequestError) {
    return apiJson(
      requestId,
      { error: error.message, requestId },
      { status: error.status },
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "api_request_failed",
      route,
      requestId,
      errorClass: error instanceof Error ? error.name : typeof error,
      errorCode: errorCode(error),
    }),
  );

  return apiJson(
    requestId,
    { error: fallbackMessage, requestId },
    { status: fallbackStatus },
  );
}
