/**
 * Supabase server-only helpers (service role).
 *
 * Pattern A:
 * - Browser never talks to Supabase directly
 * - Next.js route handlers use service-role key to read/write per app session
 *
 * Env required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Tables (expected from migrations):
 * - public.app_users
 * - public.success_path_sessions
 * - public.success_path_messages
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type DbAppUser = {
  id: string;
  wp_user_id: string;
  wp_display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type DbSuccessPathSession = {
  id: string;
  user_id: string;

  // Backed by DB column `status` in success_path_sessions
  status: "active" | "completed" | "archived";

  // Derived helper for existing API response mappings
  is_active: boolean;

  active_step_id: string | null;
  active_task_id: string | null;

  completed_item_ids: string[]; // jsonb in DB but returned as JS array
  diagnostic_answers: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
};

export type DbSuccessPathMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;

  step_id: string | null;
  task_id: string | null;

  created_at: string;
};

function getEnvOrThrow(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/**
 * Singleton-ish server client. In serverless this will be recreated as needed,
 * but within a single invocation it's useful to reuse.
 */
let _serviceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  const url = getEnvOrThrow("SUPABASE_URL");
  const serviceKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  _serviceClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return _serviceClient;
}

export class SupabaseServerError extends Error {
  public readonly code:
    | "DB_ERROR"
    | "NOT_FOUND"
    | "INVALID_ARGUMENT"
    | "CONFLICT";

  constructor(code: SupabaseServerError["code"], message: string) {
    super(message);
    this.name = "SupabaseServerError";
    this.code = code;
  }
}

function assertNonEmptyString(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SupabaseServerError(
      "INVALID_ARGUMENT",
      `${name} must be a non-empty string`,
    );
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((x) => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * app_users
 */

export async function upsertAppUserByWpUserId(opts: {
  wpUserId: string;
  displayName?: string | null;
}): Promise<DbAppUser> {
  assertNonEmptyString(opts.wpUserId, "wpUserId");
  const supabase = getSupabaseServiceClient();

  // We prefer an upsert for idempotency. This requires a UNIQUE constraint on wp_user_id.
  const { data, error } = await supabase
    .from("app_users")
    .upsert(
      {
        wp_user_id: opts.wpUserId,
        wp_display_name: opts.displayName ?? null,
      },
      { onConflict: "wp_user_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to upsert app_user: ${error.message}`,
    );
  }
  if (!data) {
    throw new SupabaseServerError("DB_ERROR", "Upsert returned no data.");
  }

  return data as DbAppUser;
}

export async function getAppUserById(userId: string): Promise<DbAppUser> {
  assertNonEmptyString(userId, "userId");
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    // supabase-js uses 406 "PGRST116" sometimes for no rows; message varies.
    if (String(error.code).toLowerCase().includes("pgrst116")) {
      throw new SupabaseServerError("NOT_FOUND", "User not found.");
    }
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to load user: ${error.message}`,
    );
  }
  if (!data) throw new SupabaseServerError("NOT_FOUND", "User not found.");

  return data as DbAppUser;
}

/**
 * success_path_sessions
 */

export async function ensureActiveSessionForUser(opts: {
  userId: string;
}): Promise<DbSuccessPathSession> {
  assertNonEmptyString(opts.userId, "userId");
  const supabase = getSupabaseServiceClient();

  // 1) Try to load existing active session
  const existing = await supabase
    .from("success_path_sessions")
    .select("*")
    .eq("user_id", opts.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing.error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to load active session: ${existing.error.message}`,
    );
  }

  const row = (existing.data?.[0] ?? null) as DbSuccessPathSession | null;
  if (row) return coerceSessionRow(row);

  // 2) Otherwise create a new active session
  const created = await supabase
    .from("success_path_sessions")
    .insert({
      user_id: opts.userId,
      status: "active",
      active_step_id: null,
      active_task_id: null,
      completed_item_ids: [],
      diagnostic_answers: null,
    })
    .select("*")
    .single();

  if (created.error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to create session: ${created.error.message}`,
    );
  }
  if (!created.data) {
    throw new SupabaseServerError(
      "DB_ERROR",
      "Session insert returned no data.",
    );
  }

  return coerceSessionRow(created.data as DbSuccessPathSession);
}

export async function getActiveSessionForUser(opts: {
  userId: string;
}): Promise<DbSuccessPathSession | null> {
  assertNonEmptyString(opts.userId, "userId");
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("success_path_sessions")
    .select("*")
    .eq("user_id", opts.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to load active session: ${error.message}`,
    );
  }

  const row = (data?.[0] ?? null) as DbSuccessPathSession | null;
  return row ? coerceSessionRow(row) : null;
}

export async function updateSession(opts: {
  sessionId: string;
  activeStepId?: string | null;
  activeTaskId?: string | null;
  diagnosticAnswers?: Record<string, unknown> | null;
}): Promise<DbSuccessPathSession> {
  assertNonEmptyString(opts.sessionId, "sessionId");
  const supabase = getSupabaseServiceClient();

  const patch: Record<string, unknown> = {};
  if ("activeStepId" in opts) patch.active_step_id = opts.activeStepId ?? null;
  if ("activeTaskId" in opts) patch.active_task_id = opts.activeTaskId ?? null;
  if ("diagnosticAnswers" in opts)
    patch.diagnostic_answers = opts.diagnosticAnswers ?? null;

  const { data, error } = await supabase
    .from("success_path_sessions")
    .update(patch)
    .eq("id", opts.sessionId)
    .select("*")
    .single();

  if (error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to update session: ${error.message}`,
    );
  }
  if (!data) throw new SupabaseServerError("NOT_FOUND", "Session not found.");

  return coerceSessionRow(data as DbSuccessPathSession);
}

export async function setCompletedItemIds(opts: {
  sessionId: string;
  completedItemIds: string[];
}): Promise<DbSuccessPathSession> {
  assertNonEmptyString(opts.sessionId, "sessionId");

  const supabase = getSupabaseServiceClient();

  const completed = Array.from(
    new Set(opts.completedItemIds.map((s) => s.trim()).filter(Boolean)),
  );

  const { data, error } = await supabase
    .from("success_path_sessions")
    .update({ completed_item_ids: completed })
    .eq("id", opts.sessionId)
    .select("*")
    .single();

  if (error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to update progress: ${error.message}`,
    );
  }
  if (!data) throw new SupabaseServerError("NOT_FOUND", "Session not found.");

  return coerceSessionRow(data as DbSuccessPathSession);
}

function coerceSessionRow(row: DbSuccessPathSession): DbSuccessPathSession {
  const rawStatus = (row as any).status;
  const status: "active" | "completed" | "archived" =
    rawStatus === "completed" || rawStatus === "archived"
      ? rawStatus
      : "active";

  return {
    ...row,
    status,
    is_active: status === "active",
    completed_item_ids: normalizeStringArray((row as any).completed_item_ids),
    diagnostic_answers: (row as any).diagnostic_answers ?? null,
  };
}

/**
 * success_path_messages
 */

export async function insertMessage(opts: {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  stepId?: string | null;
  taskId?: string | null;
  userId?: string | null;
}): Promise<DbSuccessPathMessage> {
  assertNonEmptyString(opts.sessionId, "sessionId");
  assertNonEmptyString(opts.content, "content");

  const supabase = getSupabaseServiceClient();

  // success_path_messages.user_id is required by schema.
  // Prefer explicit userId when provided; otherwise resolve it from the session row.
  let resolvedUserId =
    typeof opts.userId === "string" ? opts.userId.trim() : "";

  if (!resolvedUserId) {
    const sessionLookup = await supabase
      .from("success_path_sessions")
      .select("user_id")
      .eq("id", opts.sessionId)
      .single();

    if (sessionLookup.error) {
      throw new SupabaseServerError(
        "DB_ERROR",
        `Failed to resolve message user_id from session: ${sessionLookup.error.message}`,
      );
    }

    const fromSession = (sessionLookup.data as { user_id?: string } | null)
      ?.user_id;
    if (typeof fromSession !== "string" || !fromSession.trim()) {
      throw new SupabaseServerError(
        "DB_ERROR",
        "Failed to resolve message user_id from session.",
      );
    }

    resolvedUserId = fromSession.trim();
  }

  const { data, error } = await supabase
    .from("success_path_messages")
    .insert({
      session_id: opts.sessionId,
      user_id: resolvedUserId,
      role: opts.role,
      content: opts.content,
      step_id: opts.stepId ?? null,
      task_id: opts.taskId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to insert message: ${error.message}`,
    );
  }
  if (!data)
    throw new SupabaseServerError(
      "DB_ERROR",
      "Message insert returned no data.",
    );

  return data as DbSuccessPathMessage;
}

export async function listRecentMessages(opts: {
  sessionId: string;
  limit?: number;
}): Promise<DbSuccessPathMessage[]> {
  assertNonEmptyString(opts.sessionId, "sessionId");
  const supabase = getSupabaseServiceClient();

  const limit =
    typeof opts.limit === "number" && opts.limit > 0
      ? Math.min(opts.limit, 100)
      : 20;

  const { data, error } = await supabase
    .from("success_path_messages")
    .select("*")
    .eq("session_id", opts.sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new SupabaseServerError(
      "DB_ERROR",
      `Failed to list messages: ${error.message}`,
    );
  }

  return (data ?? []) as DbSuccessPathMessage[];
}

/**
 * Convenience helper for `GET /api/session/ensure`
 */
export async function ensureSessionAndRecentMessages(opts: {
  userId: string;
  messageLimit?: number;
}): Promise<{
  session: DbSuccessPathSession;
  messages: DbSuccessPathMessage[];
}> {
  const session = await ensureActiveSessionForUser({ userId: opts.userId });
  const messages = await listRecentMessages({
    sessionId: session.id,
    limit: opts.messageLimit,
  });
  return { session, messages };
}
