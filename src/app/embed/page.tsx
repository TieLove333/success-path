"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ChatManager from "@/components/chat/ChatManager";

type WpSsoEnvelope = {
  type: "PORCHLYTE_WP_SSO_V1";
  v: 1;
  payload: string;
  sig: string;
};

type ApiOk<T> = { ok: true; requestId: string; data: T };
type ApiErr = {
  ok: false;
  requestId: string;
  error: { code: string; message: string; details?: unknown };
};
type ApiResponse<T> = ApiOk<T> | ApiErr;

type EnsureSessionResponse = {
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

type ExchangeResponse = {
  user: { id: string; wpUserId: string; displayName: string | null };
  session: {
    id: string;
    isActive: boolean;
    activeStepId: string | null;
    activeTaskId: string | null;
    completedItemIds: string[];
    diagnosticAnswers: Record<string, unknown> | null;
  };
};

type BootstrapState =
  | { status: "waiting_for_sso" }
  | { status: "exchanging_sso" }
  | { status: "loading_session" }
  | {
      status: "ready";
      session: EnsureSessionResponse["session"];
      messages: EnsureSessionResponse["messages"];
    }
  | { status: "error"; message: string; requestId?: string };

const APP_MESSAGE_TYPE = "PORCHLYTE_WP_SSO_V1" as const;

function parseAllowedWpOrigins(): string[] {
  const raw = (process.env.NEXT_PUBLIC_ALLOWED_WP_ORIGINS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function isWpSsoEnvelope(value: unknown): value is WpSsoEnvelope {
  if (!isPlainObject(value)) return false;
  return (
    value.type === APP_MESSAGE_TYPE &&
    value.v === 1 &&
    typeof value.payload === "string" &&
    typeof value.sig === "string"
  );
}

async function postJson<T>(
  url: string,
  body: unknown,
): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return {
      ok: false,
      requestId: res.headers.get("x-request-id") ?? "unknown",
      error: {
        code: "BAD_RESPONSE",
        message: `Server returned non-JSON response (${res.status}).`,
        details: { body: text.slice(0, 500) },
      },
    };
  }
}

async function getJson<T>(url: string): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "include",
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return {
      ok: false,
      requestId: res.headers.get("x-request-id") ?? "unknown",
      error: {
        code: "BAD_RESPONSE",
        message: `Server returned non-JSON response (${res.status}).`,
        details: { body: text.slice(0, 500) },
      },
    };
  }
}

/**
 * Embed bootstrap:
 * - waits for WP `postMessage` SSO envelope
 * - calls `/api/auth/wp/exchange` to set httpOnly cookie
 * - calls `/api/session/ensure` to hydrate server-side session data
 * - then renders the existing ChatManager UI
 *
 * Notes:
 * - At the moment, ChatManager is not yet wired to consume the hydrated session/messages.
 *   We still do the server calls here so the cookie/session are guaranteed to exist,
 *   and so the next wiring step is strictly UI-state integration (no auth work).
 */
export default function EmbedPage() {
  const [state, setState] = useState<BootstrapState>({
    status: "waiting_for_sso",
  });

  const allowedWpOrigins = useMemo(() => parseAllowedWpOrigins(), []);
  const exchangedOnceRef = useRef(false);

  useEffect(() => {
    // Tell parent we are ready (parent can optionally wait for this).
    try {
      window.parent?.postMessage({ type: "PORCHLYTE_EMBED_READY", v: 1 }, "*");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function handleEnvelope(envelope: WpSsoEnvelope) {
      if (exchangedOnceRef.current) return;
      exchangedOnceRef.current = true;

      setState({ status: "exchanging_sso" });

      const exchange = await postJson<ExchangeResponse>(
        "/api/auth/wp/exchange",
        envelope,
      );

      if (!exchange.ok) {
        setState({
          status: "error",
          message: exchange.error.message || "Failed to exchange SSO.",
          requestId: exchange.requestId,
        });
        return;
      }

      setState({ status: "loading_session" });

      const ensured = await getJson<EnsureSessionResponse>(
        "/api/session/ensure?limit=20",
      );

      if (!ensured.ok) {
        setState({
          status: "error",
          message: ensured.error.message || "Failed to load session.",
          requestId: ensured.requestId,
        });
        return;
      }

      setState({
        status: "ready",
        session: ensured.data.session,
        messages: ensured.data.messages,
      });
    }

    function onMessage(event: MessageEvent) {
      // If configured, only accept messages from known WP origins.
      if (
        allowedWpOrigins.length > 0 &&
        !allowedWpOrigins.includes(event.origin)
      ) {
        return;
      }

      if (!isWpSsoEnvelope(event.data)) return;
      void handleEnvelope(event.data);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowedWpOrigins]);

  if (state.status === "ready") {
    return (
      <ChatManager
        hydratedState={{
          session: state.session,
          messages: state.messages,
        }}
      />
    );
  }

  // Lightweight inline bootstrap UI (kept intentionally simple for iframe usage)
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans"',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 16,
          background: "white",
        }}
      >
        <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>Success Path</h1>
          <span style={{ color: "rgba(0,0,0,0.55)", fontSize: 12 }}>
            {state.status === "waiting_for_sso" && "Waiting for sign-in…"}
            {state.status === "exchanging_sso" && "Signing you in…"}
            {state.status === "loading_session" && "Loading your workspace…"}
            {state.status === "error" && "Error"}
          </span>
        </header>

        <div style={{ marginTop: 12 }}>
          {state.status === "waiting_for_sso" && (
            <div>
              <p style={{ margin: 0, color: "rgba(0,0,0,0.75)" }}>
                Waiting for the members site to securely sign you in.
              </p>
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontSize: 12,
                  color: "rgba(0,0,0,0.55)",
                }}
              >
                Tip: the parent page should send a{" "}
                <code>{APP_MESSAGE_TYPE}</code> postMessage to this iframe.
              </p>
            </div>
          )}

          {state.status === "exchanging_sso" && (
            <p style={{ margin: 0, color: "rgba(0,0,0,0.75)" }}>
              Verifying your membership and creating your session…
            </p>
          )}

          {state.status === "loading_session" && (
            <p style={{ margin: 0, color: "rgba(0,0,0,0.75)" }}>
              Loading saved progress and recent messages…
            </p>
          )}

          {state.status === "error" && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: "rgba(255,0,0,0.06)",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>Something went wrong</p>
              <p style={{ marginTop: 6, marginBottom: 0 }}>{state.message}</p>
              {state.requestId ? (
                <p
                  style={{
                    marginTop: 8,
                    marginBottom: 0,
                    fontSize: 12,
                    color: "rgba(0,0,0,0.6)",
                  }}
                >
                  Request ID: <code>{state.requestId}</code>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
