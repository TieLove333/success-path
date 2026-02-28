import { cookies } from "next/headers";

import {
  APP_SESSION_COOKIE_NAME,
  AuthError,
  verifyAppSessionCookieValueOrThrow,
} from "@/lib/auth";
import {
  getRequestId,
  HttpError,
  jsonError,
  jsonOk,
  readJsonBodyOrThrow,
} from "@/lib/api";
import {
  ensureActiveSessionForUser,
  setCompletedItemIds,
} from "@/lib/supabaseServer";

export const runtime = "nodejs";

type PatchProgressRequest = {
  completedItemIds: string[];
};

type PatchProgressResponse = {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function normalizeCompletedItemIdsOrThrow(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new HttpError(
      400,
      "INVALID_COMPLETED_ITEM_IDS",
      "completedItemIds must be an array of strings.",
    );
  }

  const normalized = value
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);

  // If the caller passed an array but none were strings, treat as invalid.
  if (value.length > 0 && normalized.length === 0) {
    throw new HttpError(
      400,
      "INVALID_COMPLETED_ITEM_IDS",
      "completedItemIds must contain string ids.",
    );
  }

  // de-dupe while preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of normalized) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }

  // Keep a sane cap to avoid abuse / huge rows
  if (deduped.length > 5000) {
    throw new HttpError(
      400,
      "TOO_MANY_ITEMS",
      "completedItemIds is too large.",
    );
  }

  return deduped;
}

function validateBodyOrThrow(body: unknown): PatchProgressRequest {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "BAD_REQUEST", "Body must be a JSON object.");
  }

  if (!Object.prototype.hasOwnProperty.call(body, "completedItemIds")) {
    throw new HttpError(
      400,
      "MISSING_COMPLETED_ITEM_IDS",
      "completedItemIds is required.",
    );
  }

  const completedItemIds = normalizeCompletedItemIdsOrThrow(
    (body as any).completedItemIds,
  );

  return { completedItemIds };
}

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);

  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(APP_SESSION_COOKIE_NAME)?.value;

    const claims = verifyAppSessionCookieValueOrThrow({ cookieValue });

    const rawBody = await readJsonBodyOrThrow<unknown>(request);
    const body = validateBodyOrThrow(rawBody);

    const session = await ensureActiveSessionForUser({ userId: claims.userId });

    const updated = await setCompletedItemIds({
      sessionId: session.id,
      completedItemIds: body.completedItemIds,
    });

    const responseBody: PatchProgressResponse = {
      session: {
        id: updated.id,
        isActive: updated.is_active,
        activeStepId: updated.active_step_id,
        activeTaskId: updated.active_task_id,
        completedItemIds: updated.completed_item_ids ?? [],
        diagnosticAnswers:
          (updated.diagnostic_answers as Record<string, unknown> | null) ?? null,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    };

    return jsonOk(responseBody, { requestId, status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError(err, { requestId, status: err.status });
    }
    if (err instanceof HttpError) {
      return jsonError(err, {
        requestId,
        status: err.status,
        code: err.code,
        details: err.details,
      });
    }
    return jsonError(err, { requestId, status: 500 });
  }
}
