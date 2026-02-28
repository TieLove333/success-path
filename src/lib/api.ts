/**
 * Shared API helpers for Next.js route handlers:
 * - Request ID extraction / generation
 * - Consistent JSON responses for success + errors
 * - Small utilities for safe parsing + error normalization
 *
 * Intended usage (route handlers):
 *   const requestId = getRequestId(request);
 *   try { ... } catch (err) { return jsonError(err, { requestId }); }
 */

export type ApiErrorBody = {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiOkBody<T> = {
  ok: true;
  requestId: string;
  data: T;
};

export type ApiResponseBody<T> = ApiOkBody<T> | ApiErrorBody;

export type JsonSuccessInit = {
  requestId: string;
  status?: number;
  headers?: HeadersInit;
};

export type JsonErrorInit = {
  requestId: string;
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
  headers?: HeadersInit;
};

/**
 * Standard header used by many APIs for request correlation.
 */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Generate a reasonably unique request id without external deps.
 */
export function generateRequestId(): string {
  // Prefer crypto.randomUUID when available (Node 18+ has it on globalThis.crypto).
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();

  // Fallback: time + randomness.
  const rand = Math.random().toString(36).slice(2);
  return `req_${Date.now().toString(36)}_${rand}`;
}

/**
 * Extract request ID from headers, else generate one.
 * Also tolerates common proxy headers.
 */
export function getRequestId(request: Request): string {
  const h = request.headers;
  const fromPrimary = h.get(REQUEST_ID_HEADER);
  if (fromPrimary && fromPrimary.trim()) return fromPrimary.trim();

  const fromAlt =
    h.get("x-vercel-id") ||
    h.get("x-amzn-trace-id") ||
    h.get("cf-ray") ||
    h.get("x-correlation-id");

  if (fromAlt && fromAlt.trim()) return fromAlt.trim();

  return generateRequestId();
}

/**
 * Return a JSON success response with the request id included and echoed as a header.
 */
export function jsonOk<T>(data: T, init: JsonSuccessInit): Response {
  const status = init.status ?? 200;

  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set(REQUEST_ID_HEADER, init.requestId);

  const body: ApiOkBody<T> = { ok: true, requestId: init.requestId, data };
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Normalized error shape used by all routes.
 */
export function jsonError(err: unknown, init: JsonErrorInit): Response {
  const normalized = normalizeError(err);

  const status = init.status ?? normalized.status ?? 500;
  const code = init.code ?? normalized.code ?? "INTERNAL_ERROR";
  const message =
    init.message ??
    normalized.message ??
    "An unexpected error occurred. Please try again.";

  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set(REQUEST_ID_HEADER, init.requestId);

  const body: ApiErrorBody = {
    ok: false,
    requestId: init.requestId,
    error: {
      code,
      message,
      details: init.details ?? normalized.details,
    },
  };

  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Safe JSON body parsing with good error messaging.
 */
export async function readJsonBodyOrThrow<T = unknown>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json body.");
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "BAD_JSON", "Request body was not valid JSON.");
  }
}

/**
 * Lightweight HTTP error that route handlers can throw to map to a status/code.
 */
export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type NormalizedError = {
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
};

function normalizeError(err: unknown): NormalizedError {
  if (!err) return {};

  if (err instanceof HttpError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  // Support custom error shapes (ex: AuthError, SupabaseServerError, Zod errors, etc.)
  if (typeof err === "object") {
    const anyErr = err as any;

    const status =
      typeof anyErr.status === "number"
        ? anyErr.status
        : typeof anyErr.statusCode === "number"
          ? anyErr.statusCode
          : undefined;

    const code =
      typeof anyErr.code === "string"
        ? anyErr.code
        : typeof anyErr.name === "string"
          ? anyErr.name
          : undefined;

    const message =
      typeof anyErr.message === "string" ? anyErr.message : "Unknown error";

    const details =
      anyErr.details ??
      anyErr.cause ??
      (anyErr.issues ? { issues: anyErr.issues } : undefined);

    return { status, code, message, details };
  }

  if (typeof err === "string") return { message: err };

  return { message: "Unknown error" };
}
