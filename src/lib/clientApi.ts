/**
 * Client-side API wrapper for persistence endpoints.
 *
 * Goals:
 * - Typed, consistent responses
 * - Always include credentials (for httpOnly cookie auth)
 * - Normalize non-JSON and error responses
 *
 * Endpoints covered:
 * - GET    /api/session/ensure?limit=N
 * - PATCH  /api/session
 * - PATCH  /api/progress
 * - POST   /api/messages
 */

export type ApiOk<T> = { ok: true; requestId: string; data: T };
export type ApiErr = {
  ok: false;
  requestId: string;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type EnsureSessionResponse = {
  session: {
    id: string;
    isActive: boolean;
    activeStepId: string | null;
    activeTaskId: string | null;
    completedItemIds: string[];
    diagnosticAnswers: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    stepId: string | null;
    taskId: string | null;
    createdAt: string;
  }>;
};

export type PatchSessionRequest = {
  activeStepId?: string | null;
  activeTaskId?: string | null;
  diagnosticAnswers?: Record<string, unknown> | null;
};

export type PatchSessionResponse = {
  session: {
    id: string;
    isActive: boolean;
    activeStepId: string | null;
    activeTaskId: string | null;
    completedItemIds: string[];
    diagnosticAnswers: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type PatchProgressRequest = {
  completedItemIds: string[];
};

export type PatchProgressResponse = {
  session: {
    id: string;
    isActive: boolean;
    activeStepId: string | null;
    activeTaskId: string | null;
    completedItemIds: string[];
    diagnosticAnswers: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type PostMessageRequest = {
  role: "user" | "assistant" | "system";
  content: string;
  stepId?: string | null;
  taskId?: string | null;
};

export type PostMessageResponse = {
  message: {
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    stepId: string | null;
    taskId: string | null;
    createdAt: string;
  };
};

type RequestOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

function getRequestIdFromHeaders(h: Headers): string {
  return (
    h.get("x-request-id") ||
    h.get("x-vercel-id") ||
    h.get("x-correlation-id") ||
    "unknown"
  );
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(input, {
    ...init,
    credentials: "include",
    // Avoid caching for persistence-related calls
    cache: "no-store",
  });

  const requestId = getRequestIdFromHeaders(res.headers);
  const text = await res.text();

  const parsed = safeJsonParse(text);
  if (parsed && typeof parsed === "object" && parsed !== null) {
    // Trust the server's shape if it matches our envelope
    const maybe = parsed as any;
    if (typeof maybe.ok === "boolean" && typeof maybe.requestId === "string") {
      return maybe as ApiResponse<T>;
    }
  }

  // Normalize unexpected responses (non-JSON or different JSON shape)
  if (!res.ok) {
    return {
      ok: false,
      requestId,
      error: {
        code: "BAD_RESPONSE",
        message: `Request failed (${res.status}).`,
        details: {
          status: res.status,
          body: text.slice(0, 1000),
        },
      },
    };
  }

  return {
    ok: false,
    requestId,
    error: {
      code: "BAD_RESPONSE",
      message: "Server returned an unexpected response shape.",
      details: { body: text.slice(0, 1000) },
    },
  };
}

export const clientApi = {
  async ensureSession(
    opts?: { limit?: number } & RequestOptions,
  ): Promise<ApiResponse<EnsureSessionResponse>> {
    const limit =
      typeof opts?.limit === "number" && opts.limit > 0
        ? Math.min(Math.floor(opts.limit), 100)
        : 20;

    const url = `/api/session/ensure?limit=${encodeURIComponent(String(limit))}`;
    return requestJson<EnsureSessionResponse>(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(opts?.headers ?? {}),
      },
      signal: opts?.signal,
    });
  },

  async patchSession(
    body: PatchSessionRequest,
    opts?: RequestOptions,
  ): Promise<ApiResponse<PatchSessionResponse>> {
    return requestJson<PatchSessionResponse>("/api/session", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(opts?.headers ?? {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: opts?.signal,
    });
  },

  async patchProgress(
    body: PatchProgressRequest,
    opts?: RequestOptions,
  ): Promise<ApiResponse<PatchProgressResponse>> {
    return requestJson<PatchProgressResponse>("/api/progress", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(opts?.headers ?? {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: opts?.signal,
    });
  },

  async postMessage(
    body: PostMessageRequest,
    opts?: RequestOptions,
  ): Promise<ApiResponse<PostMessageResponse>> {
    return requestJson<PostMessageResponse>("/api/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts?.headers ?? {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: opts?.signal,
    });
  },
};
