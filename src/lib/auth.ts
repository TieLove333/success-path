/**
 * Server-only auth utilities:
 * - Verify WP -> App SSO payloads (base64url JSON + HMAC SHA-256)
 * - Sign / verify an app session cookie (HMAC SHA-256)
 *
 * This module is intended to be imported ONLY from server contexts
 * (Next.js route handlers / server actions).
 */

import crypto from "crypto";

export const WP_SSO_MESSAGE_TYPE = "PORCHLYTE_WP_SSO_V1" as const;
export const WP_SSO_VERSION = 1 as const;

const DEFAULT_CLOCK_SKEW_SECONDS = 30;
const DEFAULT_MAX_TTL_SECONDS = 10 * 60; // safety cap, even if exp is far out

export type WpMembershipPayload = {
  status?: string; // e.g. "active"
  tier?: string; // e.g. "pro"
  [k: string]: unknown;
};

export type WpSsoPayload = {
  wp_user_id: string | number;
  membership: WpMembershipPayload | string | null;
  iat: number; // unix seconds
  exp: number; // unix seconds
  display_name?: string;
  email?: string;
  [k: string]: unknown;
};

export type WpSsoEnvelope = {
  type: typeof WP_SSO_MESSAGE_TYPE;
  v: typeof WP_SSO_VERSION;
  payload: string; // base64url(JSON)
  sig: string; // base64url(HMAC_SHA256(payload))
};

export type VerifiedWpSso = {
  wpUserId: string;
  displayName?: string;
  membership: WpSsoPayload["membership"];
  iat: number;
  exp: number;
  raw: WpSsoPayload;
};

export type AppSessionClaims = {
  /**
   * Internal app user id (UUID from `public.app_users.id`)
   */
  userId: string;

  /**
   * Associated WP user id (stringified)
   */
  wpUserId: string;

  /**
   * Issued at (unix seconds)
   */
  iat: number;

  /**
   * Expires at (unix seconds)
   */
  exp: number;
};

export class AuthError extends Error {
  public readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "EXPIRED"
    | "INVALID_SIGNATURE"
    | "INVALID_PAYLOAD"
    | "MISCONFIGURED";

  public readonly status: number;

  constructor(
    code: AuthError["code"],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status =
      status ??
      (code === "FORBIDDEN"
        ? 403
        : code === "UNAUTHORIZED" ||
            code === "INVALID_SIGNATURE" ||
            code === "EXPIRED"
          ? 401
          : code === "MISCONFIGURED"
            ? 500
            : 400);
  }
}

/**
 * Prevent accidental client imports.
 * Next.js sets `window` in browser; this throws early if you import it client-side.
 */
function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new AuthError(
      "MISCONFIGURED",
      "`src/lib/auth.ts` is server-only but was imported in a browser bundle.",
      500,
    );
  }
}

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new AuthError(
      "MISCONFIGURED",
      `Missing required environment variable: ${name}`,
      500,
    );
  }
  return value;
}

export function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function base64UrlDecodeToBuffer(input: string): Buffer {
  // Convert base64url -> base64 and pad
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLen);
  return Buffer.from(padded, "base64");
}

export function base64UrlDecodeToString(input: string): string {
  return base64UrlDecodeToBuffer(input).toString("utf8");
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function hmacSha256Base64Url(secret: string, data: string): string {
  const mac = crypto.createHmac("sha256", secret).update(data, "utf8").digest();
  return base64UrlEncode(mac);
}

export function nowUnixSeconds(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Validates iat/exp with optional clock skew and a safety max TTL.
 */
export function validateIatExpOrThrow(opts: {
  iat: number;
  exp: number;
  now?: number;
  clockSkewSeconds?: number;
  maxTtlSeconds?: number;
}) {
  const now = opts.now ?? nowUnixSeconds();
  const skew = opts.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const maxTtl = opts.maxTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS;

  if (!Number.isFinite(opts.iat) || !Number.isFinite(opts.exp)) {
    throw new AuthError("INVALID_PAYLOAD", "iat/exp must be numbers.", 400);
  }
  if (opts.exp <= opts.iat) {
    throw new AuthError("INVALID_PAYLOAD", "exp must be > iat.", 400);
  }

  const ttl = opts.exp - opts.iat;
  if (ttl > maxTtl) {
    throw new AuthError(
      "INVALID_PAYLOAD",
      `Token TTL too long (${ttl}s).`,
      400,
    );
  }

  // Not valid yet (iat is too far in the future)
  if (opts.iat > now + skew) {
    throw new AuthError("UNAUTHORIZED", "Token iat is in the future.", 401);
  }

  // Expired (allow small skew)
  if (opts.exp < now - skew) {
    throw new AuthError("EXPIRED", "Token expired.", 401);
  }
}

/**
 * Parse and verify WP SSO envelope. This does not validate membership status;
 * that is an application policy decision.
 */
export function verifyWpSsoEnvelopeOrThrow(
  envelope: unknown,
  opts?: {
    wpSsoSecret?: string;
    now?: number;
    clockSkewSeconds?: number;
    maxTtlSeconds?: number;
  },
): VerifiedWpSso {
  assertServerOnly();

  const secret = opts?.wpSsoSecret ?? getEnvOrThrow("WP_SSO_SECRET");

  if (!envelope || typeof envelope !== "object") {
    throw new AuthError("BAD_REQUEST", "Missing SSO envelope.", 400);
  }

  const e = envelope as Partial<WpSsoEnvelope>;

  if (e.type !== WP_SSO_MESSAGE_TYPE) {
    throw new AuthError("BAD_REQUEST", "Unexpected SSO message type.", 400);
  }
  if (e.v !== WP_SSO_VERSION) {
    throw new AuthError("BAD_REQUEST", "Unsupported SSO version.", 400);
  }
  if (!e.payload || typeof e.payload !== "string") {
    throw new AuthError("BAD_REQUEST", "Missing payload.", 400);
  }
  if (!e.sig || typeof e.sig !== "string") {
    throw new AuthError("BAD_REQUEST", "Missing sig.", 400);
  }

  const expectedSig = hmacSha256Base64Url(secret, e.payload);
  if (!timingSafeEqual(expectedSig, e.sig)) {
    throw new AuthError("INVALID_SIGNATURE", "Bad signature.", 401);
  }

  let parsed: unknown;
  try {
    const json = base64UrlDecodeToString(e.payload);
    parsed = JSON.parse(json);
  } catch {
    throw new AuthError("INVALID_PAYLOAD", "Payload is not valid JSON.", 400);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AuthError("INVALID_PAYLOAD", "Payload must be an object.", 400);
  }

  const p = parsed as Partial<WpSsoPayload>;

  if (
    typeof p.wp_user_id !== "string" &&
    typeof p.wp_user_id !== "number"
  ) {
    throw new AuthError(
      "INVALID_PAYLOAD",
      "wp_user_id must be string or number.",
      400,
    );
  }

  if (!Number.isFinite(p.iat) || !Number.isFinite(p.exp)) {
    throw new AuthError("INVALID_PAYLOAD", "iat/exp required.", 400);
  }

  validateIatExpOrThrow({
    iat: p.iat as number,
    exp: p.exp as number,
    now: opts?.now,
    clockSkewSeconds: opts?.clockSkewSeconds,
    maxTtlSeconds: opts?.maxTtlSeconds,
  });

  const wpUserId = String(p.wp_user_id);

  return {
    wpUserId,
    displayName: typeof p.display_name === "string" ? p.display_name : undefined,
    membership: (p.membership ?? null) as WpSsoPayload["membership"],
    iat: p.iat as number,
    exp: p.exp as number,
    raw: p as WpSsoPayload,
  };
}

/**
 * App session cookie format (v1):
 *   token = base64url(JSON(claims)) + "." + base64url(HMAC_SHA256(body))
 *
 * The cookie value itself is not encrypted; it should only contain non-sensitive
 * identifiers. It MUST be httpOnly + secure + sameSite.
 */
export function signAppSessionCookieValue(opts: {
  claims: Omit<AppSessionClaims, "iat" | "exp"> & {
    iat?: number;
    exp?: number;
  };
  sessionSecret?: string;
  ttlSeconds?: number;
  now?: number;
}): string {
  assertServerOnly();

  const sessionSecret =
    opts.sessionSecret ?? getEnvOrThrow("APP_SESSION_SECRET");

  const now = opts.now ?? nowUnixSeconds();
  const ttl = opts.ttlSeconds ?? 7 * 24 * 60 * 60; // 7 days default

  const iat = opts.claims.iat ?? now;
  const exp = opts.claims.exp ?? now + ttl;

  const claims: AppSessionClaims = {
    userId: String(opts.claims.userId),
    wpUserId: String(opts.claims.wpUserId),
    iat,
    exp,
  };

  validateIatExpOrThrow({
    iat: claims.iat,
    exp: claims.exp,
    now,
    clockSkewSeconds: DEFAULT_CLOCK_SKEW_SECONDS,
    maxTtlSeconds: Math.max(ttl, DEFAULT_MAX_TTL_SECONDS),
  });

  const body = base64UrlEncode(JSON.stringify(claims));
  const sig = hmacSha256Base64Url(sessionSecret, body);
  return `${body}.${sig}`;
}

export function verifyAppSessionCookieValueOrThrow(opts: {
  cookieValue: string | undefined | null;
  sessionSecret?: string;
  now?: number;
  clockSkewSeconds?: number;
}): AppSessionClaims {
  assertServerOnly();

  const sessionSecret =
    opts.sessionSecret ?? getEnvOrThrow("APP_SESSION_SECRET");

  const token = (opts.cookieValue ?? "").trim();
  if (!token) {
    throw new AuthError("UNAUTHORIZED", "Missing session cookie.", 401);
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new AuthError("UNAUTHORIZED", "Malformed session cookie.", 401);
  }

  const [body, sig] = parts;

  const expectedSig = hmacSha256Base64Url(sessionSecret, body);
  if (!timingSafeEqual(expectedSig, sig)) {
    throw new AuthError("INVALID_SIGNATURE", "Bad session signature.", 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecodeToString(body));
  } catch {
    throw new AuthError("UNAUTHORIZED", "Bad session body.", 401);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AuthError("UNAUTHORIZED", "Bad session claims.", 401);
  }

  const c = parsed as Partial<AppSessionClaims>;
  if (
    typeof c.userId !== "string" ||
    typeof c.wpUserId !== "string" ||
    !Number.isFinite(c.iat) ||
    !Number.isFinite(c.exp)
  ) {
    throw new AuthError("UNAUTHORIZED", "Incomplete session claims.", 401);
  }

  validateIatExpOrThrow({
    iat: c.iat as number,
    exp: c.exp as number,
    now: opts.now,
    clockSkewSeconds: opts.clockSkewSeconds,
    maxTtlSeconds: 60 * 60 * 24 * 30, // 30d cap for cookie claims
  });

  return c as AppSessionClaims;
}

/**
 * Minimal policy helper: decide whether membership is "active".
 * Customize this to match your WP membership plugin payload.
 */
export function isMembershipActive(membership: WpSsoPayload["membership"]): boolean {
  if (membership == null) return false;

  if (typeof membership === "string") {
    // Allow simple "active" / "inactive" string
    return membership.toLowerCase() === "active";
  }

  if (typeof membership === "object") {
    const status = typeof membership.status === "string" ? membership.status : "";
    return status.toLowerCase() === "active";
  }

  return false;
}

/**
 * Cookie constants. You can change the cookie name here and use it across routes.
 */
export const APP_SESSION_COOKIE_NAME = "sp_session" as const;
