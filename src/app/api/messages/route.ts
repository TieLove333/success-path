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
import { ensureActiveSessionForUser, insertMessage } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type PostMessageRequest = {
  role: "user" | "assistant" | "system";
  content: string;
  stepId?: string | null;
  taskId?: string | null;
};

type PostMessageResponse = {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function normalizeOptionalId(value: unknown, fieldName: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "BAD_REQUEST", `${fieldName} must be a string or null.`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validateBodyOrThrow(body: unknown): PostMessageRequest {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "BAD_REQUEST", "Body must be a JSON object.");
  }

  const role = (body as any).role;
  if (role !== "user" && role !== "assistant" && role !== "system") {
    throw new HttpError(
      400,
      "INVALID_ROLE",
      "role must be one of: user, assistant, system.",
    );
  }

  const content = (body as any).content;
  if (typeof content !== "string" || !content.trim()) {
    throw new HttpError(400, "INVALID_CONTENT", "content must be a non-empty string.");
  }

  const stepId = normalizeOptionalId((body as any).stepId, "stepId");
  const taskId = normalizeOptionalId((body as any).taskId, "taskId");

  return {
    role,
    content: content.trim(),
    ...(stepId !== undefined ? { stepId } : null),
    ...(taskId !== undefined ? { taskId } : null),
  };
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(APP_SESSION_COOKIE_NAME)?.value;

    const claims = verifyAppSessionCookieValueOrThrow({ cookieValue });

    const rawBody = await readJsonBodyOrThrow<unknown>(request);
    const body = validateBodyOrThrow(rawBody);

    const session = await ensureActiveSessionForUser({ userId: claims.userId });

    const saved = await insertMessage({
      sessionId: session.id,
      role: body.role,
      content: body.content,
      stepId: body.stepId ?? null,
      taskId: body.taskId ?? null,
    });

    const responseBody: PostMessageResponse = {
      message: {
        id: saved.id,
        sessionId: saved.session_id,
        role: saved.role,
        content: saved.content,
        stepId: saved.step_id,
        taskId: saved.task_id,
        createdAt: saved.created_at,
      },
    };

    return jsonOk(responseBody, { requestId, status: 201 });
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
