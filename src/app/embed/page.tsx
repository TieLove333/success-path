"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  | { status: "ready"; session: EnsureSessionResponse["session"]; messages: EnsureSessionResponse["messages"] }
  | { status: "error"; message: string; requestId?: string };

const APP_MESSAGE_TYPE = "PORCHLYTE_WP_SSO_V1" as const;

/**
 * If you ever want to additionally verify the sender origin in the client,
 * set NEXT_PUBLIC_ALLOWED_WP_ORIGINS to a comma-separated list.
 *
 * Note: server already enforces ALLOWED_WP_ORIGINS; client-side is just UX hardening.
 */
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

async function postJson<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
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
    // Normalize non-JSON server errors
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
    headers: { "accept": "application/json" },
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

export default function EmbedPage() {
  const [state, setState] = useState<BootstrapState>({ status: "waiting_for_sso" });

  const allowedWpOrigins = useMemo(() => parseAllowedWpOrigins(), []);
  const exchangedOnceRef = useRef(false);

  useEffect(() => {
    // Let the parent know we're ready to receive the token.
    // (WP script can optionally wait for this before postMessage.)
    try {
      window.parent?.postMessage(
        { type: "PORCHLYTE_EMBED_READY", v: 1 },
        "*",
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function handleEnvelope(envelope: WpSsoEnvelope) {
      if (exchangedOnceRef.current) return; // ignore duplicates
      exchangedOnceRef.current = true;

      setState({ status: "exchanging_sso" });

      const exchange = await postJson<ExchangeResponse>("/api/auth/wp/exchange", envelope);
      if (!exchange.ok) {
        setState({
          status: "error",
          message: exchange.error.message || "Failed to exchange SSO.",
          requestId: exchange.requestId,
        });
        return;
      }

      setState({ status: "loading_session" });

      const ensured = await getJson<EnsureSessionResponse>("/api/session/ensure?limit=20");
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
      // If configured, only accept from known WP origins.
      if (allowedWpOrigins.length > 0 && !allowedWpOrigins.includes(event.origin)) {
        return;
      }

      if (!isWpSsoEnvelope(event.data)) return;
      void handleEnvelope(event.data);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowedWpOrigins]);

  // Minimal UI for now: show bootstrap state and session info.
  // Next step: render your existing app UI components here and hydrate them with `state`.
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>Success Path (Embed)</h1>
          <span style={{ color: "rgba(0,0,0,0.55)", fontSize: 12 }}>
            {state.status === "waiting_for_sso" && "Waiting for sign-in…"}
            {state.status === "exchanging_sso" && "Signing you in…"}
            {state.status === "loading_session" && "Loading your workspace…"}
            {state.status === "ready" && "Ready"}
            {state.status === "error" && "Error"}
          </span>
        </header>

        <div style={{ marginTop: 12 }}>
          {state.status === "waiting_for_sso" && (
            <div>
              <p style={{ margin: 0, color: "rgba(0,0,0,0.75)" }}>
                This app is embedded inside the members area. If you stay on this
                screen, the parent page may not have sent the SSO token yet.
              </p>
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                Tip: ensure the parent page sends a <code>{APP_MESSAGE_TYPE}</code> postMessage to this iframe.
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
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,0,0,0.06)" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Something went wrong</p>
              <p style={{ marginTop: 6, marginBottom: 0 }}>{state.message}</p>
              {state.requestId ? (
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
                  Request ID: <code>{state.requestId}</code>
                </p>
              ) : null}
            </div>
          )}

          {state.status === "ready" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              <section
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 14 }}>Session</h2>
                <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,0.75)" }}>
                  <div>
                    <strong>ID:</strong> <code>{state.session.id}</code>
                  </div>
                  <div>
                    <strong>Active step:</strong>{" "}
                    {state.session.activeStepId ? <code>{state.session.activeStepId}</code> : "—"}
                  </div>
                  <div>
                    <strong>Active task:</strong>{" "}
                    {state.session.activeTaskId ? <code>{state.session.activeTaskId}</code> : "—"}
                  </div>
                  <div>
                    <strong>Completed items:</strong> {state.session.completedItemIds.length}
                  </div>
                </div>
              </section>

              <section
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 14 }}>Recent messages</h2>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {state.messages.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
                      No messages yet.
                    </p>
                  ) : (
                    state.messages.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          border: "1px solid rgba(0,0,0,0.06)",
                          borderRadius: 8,
                          padding: 10,
                          background: m.role === "assistant" ? "rgba(0,0,0,0.02)" : "white",
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <strong style={{ fontSize: 12 }}>{m.role}</strong>
                          <span style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
                            {new Date(m.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: 13 }}>
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section
                style={{
                  border: "1px dashed rgba(0,0,0,0.18)",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <p style={{ margin: 0, fontSize: 12, color: "rgba(0,0,0,0.65)" }}>
                  Next: replace this placeholder with your main app UI (the split workspace + chat).
                  You already have the cookie at this point, so the rest of the app can just call
                  <code> /api/session/ensure</code> and proceed normally.
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
