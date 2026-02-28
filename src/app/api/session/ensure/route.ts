import { cookies } from "next/headers";

import {
  APP_SESSION_COOKIE_NAME,
  AuthError,
  verifyAppSessionCookieValueOrThrow,
} from "@/lib/auth";
import { getRequestId, jsonError, jsonOk } from "@/lib/api";
import { ensureSessionAndRecentMessages } from "@/lib/supabaseServer";

export const runtime = "nodejs";

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

function parseLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return 20;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 20;

  // keep tight bounds; this is what you'll also send to the LLM per turn
  return Math.min(Math.floor(n), 100);
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const url = new URL(request.url);
    const limit = parseLimit(url);

    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(APP_SESSION_COOKIE_NAME)?.value;

    const claims = verifyAppSessionCookieValueOrThrow({
      cookieValue,
    });

    const { session, messages } = await ensureSessionAndRecentMessages({
      userId: claims.userId,
      messageLimit: limit,
    });

    const responseBody: EnsureSessionResponse = {
      session: {
        id: session.id,
        isActive: session.is_active,
        activeStepId: session.active_step_id,
        activeTaskId: session.active_task_id,
        completedItemIds: session.completed_item_ids ?? [],
        diagnosticAnswers:
          (session.diagnostic_answers as Record<string, unknown> | null) ?? null,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        stepId: m.step_id,
        taskId: m.task_id,
        createdAt: m.created_at,
      })),
    };

    return jsonOk(responseBody, { requestId, status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError(err, { requestId, status: err.status });
    }
    return jsonError(err, { requestId, status: 500 });
  }
}
