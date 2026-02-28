import { cookies } from "next/headers";

import {
  APP_SESSION_COOKIE_NAME,
  AuthError,
  verifyAppSessionCookieValueOrThrow,
} from "@/lib/auth";
import { getRequestId, jsonError, jsonOk, readJsonBodyOrThrow, HttpError } from "@/lib/api";
import { ensureActiveSessionForUser, updateSession } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type PatchSessionRequest = {
  activeStepId?: string | null;
  activeTaskId?: string | null;
  diagnosticAnswers?: Record<string, unknown> | null;
};

type PatchSessionResponse = {
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

function validatePatchBodyOrThrow(body: unknown): PatchSessionRequest {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "BAD_REQUEST", "Body must be a JSON object.");
  }

  const out: PatchSessionRequest = {};

  if ("activeStepId" in body) {
    const v = (body as any).activeStepId;
    if (v !== null && typeof v !== "string") {
      throw new HttpError(
        400,
        "INVALID_ACTIVE_STEP_ID",
        "activeStepId must be a string or null.",
      );
    }
    out.activeStepId = v ?? null;
  }

  if ("activeTaskId" in body) {
    const v = (body as any).activeTaskId;
    if (v !== null && typeof v !== "string") {
      throw new HttpError(
        400,
        "INVALID_ACTIVE_TASK_ID",
        "activeTaskId must be a string or null.",
      );
    }
    out.activeTaskId = v ?? null;
  }

  if ("diagnosticAnswers" in body) {
    const v = (body as any).diagnosticAnswers;
    if (v !== null && !isPlainObject(v)) {
      throw new HttpError(
        400,
        "INVALID_DIAGNOSTIC_ANSWERS",
        "diagnosticAnswers must be an object or null.",
      );
    }
    out.diagnosticAnswers = (v ?? null) as Record<string, unknown> | null;
  }

  if (
    !("activeStepId" in body) &&
    !("activeTaskId" in body) &&
    !("diagnosticAnswers" in body)
  ) {
    throw new HttpError(
      400,
      "NO_FIELDS",
      "Provide at least one of activeStepId, activeTaskId, diagnosticAnswers.",
    );
  }

  return out;
}

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);

  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(APP_SESSION_COOKIE_NAME)?.value;

    const claims = verifyAppSessionCookieValueOrThrow({ cookieValue });

    const rawBody = await readJsonBodyOrThrow<unknown>(request);
    const patch = validatePatchBodyOrThrow(rawBody);

    // Ensure there's an active session; then patch it by id.
    const session = await ensureActiveSessionForUser({ userId: claims.userId });

    const updated = await updateSession({
      sessionId: session.id,
      ...(Object.prototype.hasOwnProperty.call(patch, "activeStepId")
        ? { activeStepId: patch.activeStepId ?? null }
        : null),
      ...(Object.prototype.hasOwnProperty.call(patch, "activeTaskId")
        ? { activeTaskId: patch.activeTaskId ?? null }
        : null),
      ...(Object.prototype.hasOwnProperty.call(patch, "diagnosticAnswers")
        ? { diagnosticAnswers: patch.diagnosticAnswers ?? null }
        : null),
    });

    const responseBody: PatchSessionResponse = {
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
      return jsonError(err, { requestId, status: err.status, code: err.code });
    }
    return jsonError(err, { requestId, status: 500 });
  }
}
