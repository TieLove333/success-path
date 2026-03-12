import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import {
  APP_SESSION_COOKIE_NAME,
  AuthError,
  isMembershipActive,
  signAppSessionCookieValue,
  verifyWpSsoEnvelopeOrThrow,
  type WpSsoEnvelope,
} from "@/lib/auth";
import {
  jsonError,
  jsonOk,
  readJsonBodyOrThrow,
  getRequestId,
  HttpError,
} from "@/lib/api";
import {
  ensureActiveSessionForUser,
  upsertAppUserByWpUserId,
} from "@/lib/supabaseServer";

export const runtime = "nodejs";

type ExchangeResponse = {
  user: {
    id: string;
    wpUserId: string;
    displayName: string | null;
  };
  session: {
    id: string;
    isActive: boolean;
    activeStepId: string | null;
    activeTaskId: string | null;
    completedItemIds: string[];
    diagnosticAnswers: Record<string, unknown> | null;
  };
};

function parseAllowedOrigins(envValue: string | undefined | null): string[] {
  const raw = (envValue ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getRequestOrigin(reqHeaders: Headers): string | null {
  // In fetch from browser to same-origin API route, Origin should be present.
  // In some cases (older browsers / certain navigations) it may be missing.
  const origin = reqHeaders.get("origin");
  if (origin && origin.trim()) return origin.trim();

  const referer = reqHeaders.get("referer");
  if (referer && referer.trim()) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

function assertOriginAllowedOrThrow(requestOrigin: string | null) {
  const allowed = parseAllowedOrigins(process.env.ALLOWED_WP_ORIGINS);
  if (allowed.length === 0) {
    // Safer to fail closed if not configured.
    throw new AuthError(
      "MISCONFIGURED",
      "ALLOWED_WP_ORIGINS is not configured; refusing exchange.",
      500,
    );
  }

  if (!requestOrigin) {
    throw new AuthError("FORBIDDEN", "Missing Origin/Referer.", 403);
  }

  if (!allowed.includes(requestOrigin)) {
    throw new AuthError(
      "FORBIDDEN",
      `Origin not allowed: ${requestOrigin}`,
      403,
    );
  }
}

function cookieDomainFromAppOrigin(): string | undefined {
  const appOrigin = (process.env.APP_ORIGIN ?? "").trim();
  if (!appOrigin) return undefined;

  try {
    const url = new URL(appOrigin);
    // If you want to share cookie across subdomains, you could return `.${url.hostname}`.
    // For now, keep it host-only for least privilege.
    return url.hostname;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    // 1) Allowlist origin/referer (WP membership site)
    assertOriginAllowedOrThrow(getRequestOrigin(request.headers));

    // 2) Parse body (WP SSO envelope)
    const body = await readJsonBodyOrThrow<WpSsoEnvelope>(request);

    // 3) Verify envelope signature + TTL
    const verified = verifyWpSsoEnvelopeOrThrow(body);

    // 4) Policy: membership must be active
    if (!isMembershipActive(verified.membership)) {
      throw new AuthError("FORBIDDEN", "Membership is not active.", 403);
    }

    // 5) Upsert app user + ensure active session
    const user = await upsertAppUserByWpUserId({
      wpUserId: verified.wpUserId,
      displayName: verified.displayName ?? null,
    });

    const session = await ensureActiveSessionForUser({ userId: user.id });

    // 6) Set httpOnly cookie for app session
    const cookieTtlSeconds = 7 * 24 * 60 * 60; // 7d
    const cookieValue = signAppSessionCookieValue({
      claims: { userId: user.id, wpUserId: verified.wpUserId },
      ttlSeconds: cookieTtlSeconds,
    });

    const secure = process.env.NODE_ENV === "production";
    const domain = cookieDomainFromAppOrigin();

    const cookieStore = await cookies();
    cookieStore.set({
      name: APP_SESSION_COOKIE_NAME,
      value: cookieValue,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: cookieTtlSeconds,
      ...(domain ? { domain } : null),
    });

    const responseBody: ExchangeResponse = {
      user: {
        id: user.id,
        wpUserId: user.wp_user_id,
        displayName:
          (user as { wp_display_name?: string | null }).wp_display_name ?? null,
      },
      session: {
        id: session.id,
        isActive: session.is_active,
        activeStepId: session.active_step_id,
        activeTaskId: session.active_task_id,
        completedItemIds: session.completed_item_ids ?? [],
        diagnosticAnswers:
          (session.diagnostic_answers as Record<string, unknown> | null) ??
          null,
      },
    };

    // Note: jsonOk returns a Response; cookie was already set via cookies() store.
    // We still return through NextResponse-compatible Response.
    return jsonOk(responseBody, { requestId, status: 200 });
  } catch (err) {
    // Add a small hint header for debugging in non-prod without leaking sensitive info.
    const h = new Headers();
    if (process.env.NODE_ENV !== "production") {
      const origin = getRequestOrigin(request.headers);
      if (origin) h.set("x-debug-origin", origin);
    }

    // Normalize some expected errors to cleaner statuses
    if (err instanceof AuthError) {
      return jsonError(err, { requestId, status: err.status, headers: h });
    }
    if (err instanceof HttpError) {
      return jsonError(err, { requestId, status: err.status, headers: h });
    }

    return jsonError(err, { requestId, status: 500, headers: h });
  }
}

// Optional: respond to preflight explicitly (useful when embedded and calling API cross-site)
export async function OPTIONS() {
  const requestId = crypto.randomUUID?.() ?? `req_${Date.now()}`;
  const res = NextResponse.json({
    ok: true,
    requestId,
    data: { preflight: true },
  });
  res.headers.set("access-control-allow-methods", "POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type, x-request-id");
  // We intentionally do NOT set ACAO here, because this endpoint is intended to be called
  // from the app origin itself. If you later decide to call it cross-site directly from WP,
  // you can add proper CORS handling (including Vary: Origin).
  return res;
}
