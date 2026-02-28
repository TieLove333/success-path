import { randomUUID } from "crypto";
import OpenAI from "openai";
import type {
  AvailableStep,
  JsonValue,
  LlmIntent,
  LlmRequestBody,
  StepSpec,
  UserInput,
} from "@/types/llm";

/**
 * LLM Route: returns a structured "render plan" the UI can deterministically render.
 *
 * - Server-side only (keeps OPENAI_API_KEY secret)
 * - Enforces JSON-only output
 * - Validates shape and retries once if invalid
 *
 * Expected request body (minimal v1):
 * {
 *   "intent": "route_next_step" | "build_step_plan" | "need_help" | "what_next",
 *   "userInput": { "type": "text" | "action", "text?": "...", "value?": "..." },
 *   "activeStepId?": "m1.s01",
 *   "progress?": { "completedTaskIds": ["m1.s01.t01", ...], "completedStepIds?": ["m1.s01"] },
 *   "stepSpec?": { ... }, // optional: pass active step spec to constrain IDs for build_step_plan/need_help
 *   "availableSteps?": [{ "id":"m1.s01", "moduleId":"m1", "order": 1, "title":"...", "outcome":"..." }]
 * }
 *
 * Response:
 * - route_next_step:
 *   {
 *     "messages": [{ id, role: "assistant", content }],
 *     "selection": { "selectedStepId": "m1.s01", "recommended": [{ "stepId":"m1.s01", "why":"..." }] },
 *     "artifacts": [{ id, kind: "next_actions", actions: [...] }]
 *   }
 * - build_step_plan / need_help: (Render Plan as before)
 */

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function safeParseJson(
  text: string,
): { ok: true; value: JsonValue } | { ok: false; errorMessage: string } {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (err) {
    return { ok: false, errorMessage: String(err) };
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateRenderPlan(plan: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof plan !== "object" || plan === null) {
    return { ok: false, errors: ["Render plan must be an object."] };
  }

  const planObj = plan as { messages?: unknown[]; artifacts?: unknown[] };

  if (!Array.isArray(planObj.messages)) {
    errors.push("`messages` must be an array.");
  } else {
    for (const msg of planObj.messages) {
      if (typeof msg !== "object" || msg === null) {
        errors.push("Each message must be an object.");
        continue;
      }
      const msgObj = msg as { role?: unknown; content?: unknown };
      if (!["assistant"].includes(String(msgObj.role ?? ""))) {
        errors.push("Each message.role must be 'assistant'.");
      }
      if (!isNonEmptyString(msgObj.content)) {
        errors.push("Each message.content must be a non-empty string.");
      }
    }
  }

  if (!Array.isArray(planObj.artifacts)) {
    errors.push("`artifacts` must be an array.");
  } else {
    for (const art of planObj.artifacts) {
      if (typeof art !== "object" || art === null) {
        errors.push("Each artifact must be an object.");
        continue;
      }

      const artObj = art as {
        id?: unknown;
        kind?: unknown;
        data?: Record<string, unknown> | null;
        headline?: unknown;
        stepTitle?: unknown;
        taskId?: unknown;
        title?: unknown;
        instructions?: unknown;
        actions?: unknown;
      };
      const artData =
        artObj.data && typeof artObj.data === "object" ? artObj.data : null;
      const artKind = String(artObj.kind ?? "");

      if (!isNonEmptyString(artObj.id)) {
        errors.push("Each artifact.id must be a non-empty string.");
      }
      if (!isNonEmptyString(artKind)) {
        errors.push("Each artifact.kind must be a non-empty string.");
      }

      const allowedKinds = new Set([
        "step_hero",
        "task_card",
        "resource_links",
        "template",
        "next_actions",
      ]);

      if (!allowedKinds.has(artKind)) {
        errors.push(
          `Unsupported artifact.kind "${artKind}". Allowed: ${Array.from(
            allowedKinds,
          ).join(", ")}`,
        );
      }

      // Minimal kind-specific checks
      if (artKind === "step_hero") {
        if (
          !isNonEmptyString(artObj.headline) &&
          !(artData && isNonEmptyString(artData.headline))
        ) {
          errors.push(
            "step_hero must include `headline` (or `data.headline`).",
          );
        }
        if (
          !isNonEmptyString(artObj.stepTitle) &&
          !(artData && isNonEmptyString(artData.stepTitle))
        ) {
          errors.push(
            "step_hero must include `stepTitle` (or `data.stepTitle`).",
          );
        }
      }

      if (artKind === "task_card") {
        const taskId = artObj.taskId ?? artData?.taskId;
        const title = artObj.title ?? artData?.title;
        const instructions = artObj.instructions ?? artData?.instructions;

        if (!isNonEmptyString(taskId)) {
          errors.push("task_card must include `taskId` (or `data.taskId`).");
        }
        if (!isNonEmptyString(title)) {
          errors.push("task_card must include `title` (or `data.title`).");
        }
        if (!isNonEmptyString(instructions)) {
          errors.push(
            "task_card must include `instructions` (or `data.instructions`).",
          );
        }
      }

      if (artKind === "next_actions") {
        const actions = artObj.actions ?? artData?.actions;
        if (!Array.isArray(actions) || actions.length === 0) {
          errors.push(
            "next_actions must include a non-empty `actions` array (or `data.actions`).",
          );
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function normalizePlan(plan: unknown) {
  const planObj =
    plan && typeof plan === "object"
      ? (plan as { messages?: unknown[]; artifacts?: unknown[] })
      : {};
  // Accept either top-level fields OR { data: {...} } convention on artifacts.
  // Normalize artifacts to have top-level fields expected by the UI renderer.
  const normalized = {
    messages: Array.isArray(planObj.messages) ? planObj.messages : [],
    artifacts: Array.isArray(planObj.artifacts) ? planObj.artifacts : [],
  };

  normalized.messages = normalized.messages.map((m, idx) => {
    const msgObj =
      m && typeof m === "object"
        ? (m as { id?: unknown; content?: unknown })
        : {};
    return {
      id: msgObj.id ?? `msg_${idx + 1}`,
      role: "assistant",
      content: String(msgObj.content ?? ""),
    };
  });

  normalized.artifacts = normalized.artifacts.map((a, idx) => {
    const artObj =
      a && typeof a === "object"
        ? (a as {
            id?: unknown;
            kind?: unknown;
            data?: Record<string, unknown> | null;
          })
        : {};
    const base = {
      id: artObj.id ?? `art_${idx + 1}`,
      kind: artObj.kind,
    };

    if (
      artObj.data &&
      typeof artObj.data === "object" &&
      artObj.data !== null
    ) {
      return { ...base, ...artObj.data };
    }

    // If already flattened, keep as-is (minus unknown stuff).
    return { ...base, ...(artObj as Record<string, unknown>) };
  });

  return normalized;
}

function buildSystemPrompt({
  allowedTaskIds,
}: {
  allowedTaskIds: string[] | null;
}) {
  const allowedIdsText =
    Array.isArray(allowedTaskIds) && allowedTaskIds.length
      ? `\nAllowed taskIds (must use only these for task_card.taskId):\n- ${allowedTaskIds.join(
          "\n- ",
        )}\n`
      : "";

  return `
You are generating JSON for a deterministic UI.

NON-NEGOTIABLE RULES:
- Output MUST be valid JSON only. No markdown. No commentary.
- Do NOT output HTML.

When intent = "build_step_plan" or "need_help":
- Output MUST match this shape:
{
  "messages": [{ "id": "...", "role": "assistant", "content": "..." }],
  "artifacts": [
    { "id": "...", "kind": "step_hero", "headline": "...", "stepTitle": "...", "badge": "...", "promiseLine": "...", "icon": "target" },
    { "id": "...", "kind": "task_card", "taskId": "...", "title": "...", "instructions": "...", "examples": ["..."], "links": [{ "label": "...", "url": "https://..." }], "required": true, "subtasks": [{ "id":"...", "label":"...", "required": true }] },
    { "id": "...", "kind": "next_actions", "actions": [{ "id":"...", "label":"...", "value":"...", "style":"primary" }] }
  ]
}

ARTIFACT KINDS ALLOWED: step_hero, task_card, resource_links, template, next_actions
- Do NOT invent new task IDs. Use only allowedTaskIds if provided.
- Keep artifacts count <= 12.
${allowedIdsText}

When intent = "route_next_step":
- Output MUST match this shape:
{
  "messages": [{ "id": "...", "role": "assistant", "content": "..." }],
  "selection": {
    "selectedStepId": "<one of availableSteps[].id>",
    "recommended": [
      { "stepId": "<one of availableSteps[].id>", "why": "..." },
      { "stepId": "<one of availableSteps[].id>", "why": "..." }
    ]
  },
  "artifacts": [
    { "id": "...", "kind": "next_actions", "actions": [{ "id":"...", "label":"...", "value":"select_step:<stepId>", "style":"primary" }] }
  ]
}
- selectedStepId MUST be one of availableSteps[].id
- recommended[].stepId MUST be one of availableSteps[].id
- Provide 2-3 recommendations total.
`.trim();
}

function extractAllowedTaskIds(stepSpec: StepSpec | null) {
  if (!stepSpec || typeof stepSpec !== "object") return null;
  const tasks = Array.isArray(stepSpec.tasks) ? stepSpec.tasks : [];
  const ids: string[] = [];

  for (const t of tasks) {
    if (t && isNonEmptyString(t.id)) ids.push(t.id);
    if (t && Array.isArray(t.subtasks)) {
      for (const st of t.subtasks) {
        if (st && isNonEmptyString(st.id)) ids.push(st.id);
      }
    }
  }

  return ids.length ? ids : null;
}

function validateRouteSelection(
  payload: unknown,
  availableSteps: AvailableStep[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, errors: ["Route selection must be an object."] };
  }

  const payloadObj = payload as {
    messages?: unknown[];
    artifacts?: unknown[];
    selection?: unknown;
  };

  if (!Array.isArray(payloadObj.messages)) {
    errors.push("`messages` must be an array.");
  }

  if (
    typeof payloadObj.selection !== "object" ||
    payloadObj.selection === null
  ) {
    errors.push("`selection` must be an object.");
  } else {
    const allowedIds = new Set((availableSteps ?? []).map((s) => s.id));
    if (!allowedIds.size) {
      errors.push("No availableSteps provided to validate selection.");
    } else {
      const selectionObj = payloadObj.selection as {
        selectedStepId?: unknown;
        recommended?: unknown[];
      };

      if (!isNonEmptyString(selectionObj.selectedStepId)) {
        errors.push("selection.selectedStepId must be a non-empty string.");
      } else if (!allowedIds.has(selectionObj.selectedStepId)) {
        errors.push(
          "selection.selectedStepId must be one of availableSteps[].id.",
        );
      }

      if (!Array.isArray(selectionObj.recommended)) {
        errors.push("selection.recommended must be an array.");
      } else if (selectionObj.recommended.length < 2) {
        errors.push("selection.recommended must include at least 2 items.");
      } else {
        for (const rec of selectionObj.recommended) {
          if (!rec || typeof rec !== "object") {
            errors.push("Each selection.recommended item must be an object.");
            continue;
          }
          const recObj = rec as { stepId?: unknown; why?: unknown };
          if (!isNonEmptyString(recObj.stepId)) {
            errors.push("Each recommended.stepId must be a non-empty string.");
            continue;
          }
          if (!allowedIds.has(recObj.stepId)) {
            errors.push(
              "Each recommended.stepId must be one of availableSteps[].id.",
            );
          }
          if (!isNonEmptyString(recObj.why)) {
            errors.push("Each recommended.why must be a non-empty string.");
          }
        }
      }
    }
  }

  if (!Array.isArray(payloadObj.artifacts)) {
    errors.push("`artifacts` must be an array.");
  }

  return { ok: errors.length === 0, errors };
}

function normalizeRouteSelection(payload: unknown) {
  const payloadObj =
    payload && typeof payload === "object"
      ? (payload as {
          messages?: unknown[];
          artifacts?: unknown[];
          selection?: unknown;
        })
      : {};
  return {
    messages: (payloadObj.messages ?? []).map((m, idx) => {
      const msgObj =
        m && typeof m === "object"
          ? (m as { id?: unknown; content?: unknown })
          : {};
      return {
        id: msgObj.id ?? `msg_${idx + 1}`,
        role: "assistant",
        content: String(msgObj.content ?? ""),
      };
    }),
    selection: payloadObj.selection,
    artifacts: (payloadObj.artifacts ?? []).map((a, idx) => {
      const artObj =
        a && typeof a === "object"
          ? (a as {
              id?: unknown;
              kind?: unknown;
              data?: Record<string, unknown> | null;
            })
          : {};
      const base = { id: artObj.id ?? `art_${idx + 1}`, kind: artObj.kind };
      if (
        artObj.data &&
        typeof artObj.data === "object" &&
        artObj.data !== null
      ) {
        return { ...base, ...artObj.data };
      }
      return { ...base, ...(artObj as Record<string, unknown>) };
    }),
  };
}

export async function POST(req: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();

  const logPrefix = `[api/llm requestId=${requestId}]`;
  const elapsedMs = () => Date.now() - startedAt;

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      `${logPrefix} missing OPENAI_API_KEY (elapsedMs=${elapsedMs()})`,
    );
    return jsonResponse(
      {
        error:
          "OPENAI_API_KEY is not set. Add it to .env.local (server-side) and restart the dev server.",
        requestId,
      },
      500,
    );
  }

  let body: LlmRequestBody;
  try {
    body = (await req.json()) as LlmRequestBody;
  } catch (err) {
    console.error(
      `${logPrefix} invalid JSON request body (elapsedMs=${elapsedMs()})`,
      err,
    );
    return jsonResponse(
      { error: "Invalid JSON request body.", requestId },
      400,
    );
  }

  const intent: LlmIntent = body?.intent ?? "build_step_plan";
  const userInput: UserInput = body?.userInput ?? {};
  const stepSpec: StepSpec | null = body?.stepSpec ?? null;
  const availableSteps: AvailableStep[] = Array.isArray(body?.availableSteps)
    ? body.availableSteps
    : [];
  const allowedTaskIds = extractAllowedTaskIds(stepSpec);

  const system = buildSystemPrompt({ allowedTaskIds });

  const developer = `
Product behavior:
- You are a premium coaching assistant for a guided success path specifically for REAL ESTATE AGENTS (and real estate teams/brokers).
- Assume the user is a licensed real estate agent unless they explicitly say otherwise.
- Keep advice grounded in real estate workflows: lead generation, listings, buyers, open houses, showings, local market expertise, trust-building, and compliance-safe messaging.
- Use real-estate-relevant examples (e.g., "first-time buyers", "move-up sellers", "downsizers", "luxury", "investors", "relocation", "new construction") and location placeholders (e.g., "[City]").
- Avoid non-RE assumptions (e.g., e-commerce funnels, SaaS product-led growth) unless the user states that context.
- Tone: calm, high-end, direct, and execution-focused.

Intent handling:
- If intent is "route_next_step":
  - pick the best next step based on userInput + progress + diagnostic answers (if provided)
  - you MUST choose only from availableSteps.
  - return 1–3 recommended options depending on availability (if only 1 step exists, recommend just that 1).
- If intent is "build_step_plan", return:
  - one short assistant message written for a real estate agent
  - a step_hero artifact
  - a sequence of task_card artifacts (ordered)
  - next_actions including "continue" and "need_help"
- If intent is "need_help":
  - produce a template artifact that helps a real estate agent complete the active task (bio, hooks, captions, DM scripts, value props, content pillars, etc.)
  - include next_actions.
- If you lack info, ask ONE clarifying question in messages and return minimal artifacts.
`.trim();

  const context = {
    intent,
    activeStepId: body?.activeStepId ?? null,
    progress: body?.progress ?? null,
    diagnostic: body?.diagnostic ?? null,
    availableSteps: availableSteps.length
      ? availableSteps.map((s) => ({
          id: s.id,
          moduleId: s.moduleId,
          order: s.order,
          title: s.title,
          outcome: s.outcome,
        }))
      : null,
    // Pass a small, safe slice of the step spec so the model can stay aligned
    stepSpec: stepSpec
      ? {
          id: stepSpec.id,
          title: stepSpec.title,
          label: stepSpec.label,
          outcome: stepSpec.outcome,
          tasks: (stepSpec.tasks ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            required: t.required !== false,
            subtasks: (t.subtasks ?? []).map((st) => ({
              id: st.id,
              label: st.label,
              required: st.required !== false,
            })),
          })),
        }
      : null,
    userInput,
  };

  const user = isNonEmptyString(userInput.text)
    ? userInput.text
    : isNonEmptyString(userInput.value)
      ? String(userInput.value)
      : intent === "route_next_step"
        ? "Recommend what I should work on next."
        : "Build the next step plan.";

  console.info(
    `${logPrefix} start intent=${intent} activeStepId=${String(
      body?.activeStepId ?? null,
    )} allowedTaskIds=${(allowedTaskIds ?? []).length} availableSteps=${
      availableSteps.length
    } (elapsedMs=${elapsedMs()})`,
  );

  async function callModel({
    repairFromErrors,
  }: {
    repairFromErrors?: string[];
  } = {}) {
    const repair = repairFromErrors
      ? `\nThe previous JSON failed validation with these issues:\n- ${repairFromErrors.join(
          "\n- ",
        )}\nReturn corrected JSON ONLY.`
      : "";

    let response;
    try {
      response = await client.chat.completions.create({
        model: "gpt-4.1",
        temperature: 0.2,
        messages: [
          { role: "system", content: system + repair },
          { role: "developer", content: developer },
          {
            role: "developer",
            content: `Context JSON:\n${JSON.stringify(context)}`,
          },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      });
    } catch (err) {
      console.error(
        `${logPrefix} OpenAI call failed (elapsedMs=${elapsedMs()})`,
        err,
      );
      throw err;
    }

    const text = response?.choices?.[0]?.message?.content ?? "";
    if (!isNonEmptyString(text)) {
      console.warn(
        `${logPrefix} OpenAI returned empty message content (elapsedMs=${elapsedMs()})`,
      );
    }
    return text;
  }

  // First attempt
  let raw1 = "";
  try {
    raw1 = await callModel();
  } catch (err) {
    return jsonResponse(
      {
        error: "Upstream model call failed.",
        requestId,
      },
      502,
    );
  }

  const parsed1 = safeParseJson(raw1);

  if (!parsed1.ok) {
    const parseError =
      "errorMessage" in parsed1 ? parsed1.errorMessage : "Unknown parse error.";

    console.warn(
      `${logPrefix} invalid JSON from model on attempt1 (elapsedMs=${elapsedMs()}): ${parseError}`,
    );

    return jsonResponse(
      {
        error: "LLM output was not valid JSON.",
        details: parseError,
        requestId,
      },
      502,
    );
  }

  if (intent === "route_next_step") {
    // If there is only one possible step, skip LLM routing complexity and select it.
    // This prevents 502s when the validator expects 2+ recommendations but the product
    // only has a single available step in the curriculum (common early in development).
    if (availableSteps.length === 1) {
      const only = availableSteps[0];
      return jsonResponse(
        normalizeRouteSelection({
          selection: {
            selectedStepId: only.id,
            recommended: [
              {
                id: only.id,
                score: 1,
                reason:
                  "Only one Step is available right now, so it’s selected automatically.",
              },
            ],
          },
        }),
      );
    }

    const validation1 = validateRouteSelection(parsed1.value, availableSteps);
    if (validation1.ok) {
      return jsonResponse(normalizeRouteSelection(parsed1.value));
    }

    let raw2 = "";
    try {
      raw2 = await callModel({ repairFromErrors: validation1.errors });
    } catch (err) {
      console.error(
        `${logPrefix} retry model call failed intent=route_next_step (elapsedMs=${elapsedMs()})`,
        err,
      );
      return jsonResponse(
        {
          error: "Upstream model call failed (retry).",
          requestId,
        },
        502,
      );
    }

    const parsed2 = safeParseJson(raw2);

    if (parsed2.ok) {
      const validation2 = validateRouteSelection(parsed2.value, availableSteps);
      if (validation2.ok) {
        return jsonResponse(normalizeRouteSelection(parsed2.value));
      }

      console.warn(
        `${logPrefix} route selection did not validate after retry (elapsedMs=${elapsedMs()}): ${validation2.errors.join(
          " | ",
        )}`,
      );
      return jsonResponse(
        {
          error: "LLM route selection did not validate after retry.",
          details: validation2.errors,
          requestId,
        },
        502,
      );
    }

    if (!parsed2.ok) {
      const parseError =
        "errorMessage" in parsed2
          ? parsed2.errorMessage
          : "Unknown parse error.";
      console.warn(
        `${logPrefix} route selection invalid JSON after retry (elapsedMs=${elapsedMs()}): ${parseError}`,
      );
      return jsonResponse(
        {
          error: "LLM route selection was not valid JSON after retry.",
          details: parseError,
          requestId,
        },
        502,
      );
    }

    console.warn(
      `${logPrefix} route selection invalid JSON after retry (elapsedMs=${elapsedMs()}): Unknown parse failure.`,
    );
    return jsonResponse(
      {
        error: "LLM route selection was not valid JSON after retry.",
        details: "Unknown parse failure.",
        requestId,
      },
      502,
    );
  }

  // build_step_plan / need_help: validate as render plan
  const validation1 = validateRenderPlan(parsed1.value);
  if (validation1.ok) {
    return jsonResponse(normalizePlan(parsed1.value));
  }

  // Retry once with repair prompt
  console.warn(
    `${logPrefix} render plan failed validation on attempt1 (elapsedMs=${elapsedMs()}): ${validation1.errors.join(
      " | ",
    )}`,
  );

  let raw2 = "";
  try {
    raw2 = await callModel({ repairFromErrors: validation1.errors });
  } catch (err) {
    console.error(
      `${logPrefix} retry model call failed intent=${intent} (elapsedMs=${elapsedMs()})`,
      err,
    );
    return jsonResponse(
      {
        error: "Upstream model call failed (retry).",
        requestId,
      },
      502,
    );
  }

  const parsed2 = safeParseJson(raw2);

  if (parsed2.ok) {
    const validation2 = validateRenderPlan(parsed2.value);
    if (validation2.ok) {
      return jsonResponse(normalizePlan(parsed2.value));
    }

    console.warn(
      `${logPrefix} render plan did not validate after retry (elapsedMs=${elapsedMs()}): ${validation2.errors.join(
        " | ",
      )}`,
    );
    return jsonResponse(
      {
        error: "LLM output did not validate after retry.",
        details: validation2.errors,
        requestId,
      },
      502,
    );
  }

  if (!parsed2.ok) {
    const parseError =
      "errorMessage" in parsed2 ? parsed2.errorMessage : "Unknown parse error.";
    console.warn(
      `${logPrefix} invalid JSON from model after retry (elapsedMs=${elapsedMs()}): ${parseError}`,
    );
    return jsonResponse(
      {
        error: "LLM output was not valid JSON after retry.",
        details: parseError,
        requestId,
      },
      502,
    );
  }

  console.warn(
    `${logPrefix} invalid JSON from model after retry (elapsedMs=${elapsedMs()}): Unknown parse failure.`,
  );
  return jsonResponse(
    {
      error: "LLM output was not valid JSON after retry.",
      details: "Unknown parse failure.",
      requestId,
    },
    502,
  );
}
