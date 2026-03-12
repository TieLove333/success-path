"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AgentHeader from "./AgentHeader";
import ChatBubble from "./ChatBubble";
import ChoiceButtons from "./ChoiceButtons";
import MissionStepCard from "./MissionStepCard";
import LoadingScreen from "./LoadingScreen";
import ProgressTracker from "./ProgressTracker";
import ChatComposer from "./ChatComposer";
import { getAvailableSteps, getStepSpec } from "@/curriculum/index";
import type {
  ChatMessage,
  ChoiceItem,
  DiagnosticAnswer,
  DiagnosticQuestion,
  MissionData,
} from "@/types/chat";

type LlmIntent = "route_next_step" | "build_step_plan" | "need_help";

type AvailableStep = {
  id: string;
  [key: string]: unknown;
};

type StepSpecArtifact = {
  id?: string;
  kind?: string;
  data?: Record<string, unknown>;
};

type StepSpec = {
  id?: string;
  title?: string;
  outcome?: string;
  artifacts?: StepSpecArtifact[];
};

type TaskSubtask = {
  id: string;
  label: string;
};

type TaskCardArtifact = {
  kind: "task_card";
  taskId?: string;
  title: string;
  instructions: string;
  examples?: string[];
  subtasks?: TaskSubtask[];
};

type StepHeroArtifact = {
  kind: "step_hero";
  stepTitle?: string;
};

type RenderPlan = {
  artifacts?: Array<
    | TaskCardArtifact
    | StepHeroArtifact
    | { kind: string; [key: string]: unknown }
  >;
  messages?: unknown[];
  selection?: { selectedStepId?: string | null };
};

type FetchLlmRenderPlanInput = {
  intent: LlmIntent;
  userInput?: { type: string; value: string };
  activeStepId?: string | null;
  progress?: { completedTaskIds?: string[]; completedStepIds?: string[] };
  stepSpec?: StepSpec | null;
  availableSteps?: AvailableStep[];
  diagnostic?: { answers?: DiagnosticAnswer[] };
};

const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "q1",
    text: "If someone landed on your Instagram profile today, would they instantly understand who you help and how to contact you?",
    choices: [
      { id: "q1-yes", label: "Yes" },
      { id: "q1-no", label: "No" },
    ],
  },
  {
    id: "q2",
    text: "Is your 'Name Field' optimized with keywords that your ideal client is actually searching for?",
    choices: [
      { id: "q2-yes", label: "Yes" },
      { id: "q2-no", label: "No" },
    ],
  },
  {
    id: "q3",
    text: "Does your bio contain a direct Call to Action (CTA) that tells people exactly what to do next?",
    choices: [
      { id: "q3-yes", label: "Yes" },
      { id: "q3-no", label: "No" },
    ],
  },
  {
    id: "q4",
    text: "Are your contact buttons and 'Link in Bio' fully functional and friction-free?",
    choices: [
      { id: "q4-yes", label: "Yes" },
      { id: "q4-no", label: "No" },
    ],
  },
];

async function fetchLlmRenderPlan({
  intent,
  userInput,
  activeStepId,
  progress,
  stepSpec,
  availableSteps,
  diagnostic,
}: FetchLlmRenderPlanInput): Promise<RenderPlan> {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intent,
      userInput,
      activeStepId,
      progress,
      stepSpec,
      availableSteps,
      diagnostic,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${text}`);
  }

  return res.json();
}

function extractActiveTaskFromMissionData(params: {
  missionData: MissionData | null;
  activeTaskId: string | null;
}): {
  taskId: string;
  title: string;
  instructions: string;
  examples?: string[];
  subtasks?: Array<{ id: string; label: string }>;
} | null {
  const { missionData, activeTaskId } = params;
  if (!missionData || !activeTaskId) return null;

  for (const step of missionData.steps ?? []) {
    // In v1, MissionData "tasks" represent checklist items, while "content/examples" are the task's details.
    // We'll package what we can so the server can help the model answer with context.
    const taskMatch = (step.tasks ?? []).find((t) => t.id === activeTaskId);
    if (taskMatch) {
      return {
        taskId: activeTaskId,
        title: step.title,
        instructions:
          typeof step.content === "string"
            ? step.content
            : "See task details in the UI.",
        examples: step.examples,
        subtasks: (step.tasks ?? [])
          .filter((t) => Boolean(t?.id && t?.label))
          .map((t) => ({ id: String(t.id), label: String(t.label) })),
      };
    }
  }

  return null;
}

function renderPlanToMissionData({
  stepSpec,
  renderPlan,
}: {
  stepSpec: StepSpec | null | undefined;
  renderPlan: RenderPlan;
}): MissionData {
  const taskCards = (renderPlan?.artifacts ?? []).filter(
    (a): a is TaskCardArtifact => a.kind === "task_card",
  );
  const stepHero = (renderPlan?.artifacts ?? []).find(
    (a): a is StepHeroArtifact => a.kind === "step_hero",
  );

  const title = stepHero?.stepTitle ?? stepSpec?.title ?? "Success Path Step";
  const subtitle = stepSpec?.outcome ?? "";

  return {
    title,
    subtitle,
    steps: taskCards.map((t, index) => ({
      number: index + 1,
      title: t.title,
      content: t.instructions,
      examples: t.examples,
      tasks: t.subtasks?.length
        ? t.subtasks.map((st) => ({
            id: st.id,
            label: st.label,
            completed: false,
          }))
        : [
            {
              id: t.taskId,
              label: t.title,
              completed: false,
            },
          ],
    })),
  };
}

export default function ChatManager() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "Perfect. Let's run your 2-minute diagnostic." },
    {
      role: "agent",
      text: 'I\'m going to ask you four quick yes/no questions. Answer honestly — the first "No" shows us exactly where to focus.',
    },
  ]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isDiagnosticActive, setIsDiagnosticActive] = useState(false);
  const [missionData, setMissionData] = useState<MissionData | null>(null);
  const [showMissionIntro, setShowMissionIntro] = useState(false);
  const [isBuildingStep, setIsBuildingStep] = useState(false);

  // Split-view execution mode additions (v1)
  const [activeTaskContext, setActiveTaskContext] = useState<{
    stepId: string;
    taskId: string;
    taskTitle: string;
  } | null>(null);
  const [helpArtifacts, setHelpArtifacts] = useState<
    Array<{
      id: string;
      kind: string;
      title?: string;
      content?: string;
      items?: string[];
      links?: Array<{ label?: string; url?: string }>;
    }>
  >([]);
  const [isLoadingHelp, setIsLoadingHelp] = useState(false);

  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const [diagnosticAnswers, setDiagnosticAnswers] = useState<
    DiagnosticAnswer[]
  >([]);

  const availableSteps = getAvailableSteps() as AvailableStep[];
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitializing) {
      const timer = setTimeout(() => setIsDiagnosticActive(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isInitializing]);

  const handleChoice = (choice: ChoiceItem) => {
    setMessages((prev) => [...prev, { role: "user", text: choice.label }]);
    setDiagnosticAnswers((prev) => [
      ...prev,
      {
        questionId: DIAGNOSTIC_QUESTIONS[currentQuestionIndex]?.id,
        answer: choice.label,
      },
    ]);

    if (choice.label === "No") {
      setIsDiagnosticActive(false);
      triggerMissionReveal();
    } else if (currentQuestionIndex < DIAGNOSTIC_QUESTIONS.length - 1) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            text: "Excellent. Let's look at the next pillar...",
          },
        ]);
        setCurrentQuestionIndex((prev) => prev + 1);
      }, 800);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Phenomenal! Your foundation is rock solid. You're ready for the growth phase.",
        },
      ]);
      setIsDiagnosticActive(false);
    }
  };

  const [composerText, setComposerText] = useState("");

  const canShowComposer = useMemo(() => {
    // Show after the diagnostic experience begins, and keep visible during step execution.
    // We intentionally hide it only during the initialization screen.
    return !isInitializing && !isBuildingStep && !isDiagnosticActive;
  }, [isInitializing, isBuildingStep, isDiagnosticActive]);

  const isExecutionMode = useMemo(() => {
    // Split view begins when a step is loading or has loaded (workspace becomes persistent).
    return Boolean(activeStepId) || isBuildingStep || Boolean(missionData);
  }, [activeStepId, isBuildingStep, missionData]);

  const handleComposerSend = async (text: string) => {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return;

    // 1) Append the user message immediately (optimistic UI)
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setIsLoadingHelp(true);

    // 1.1) Persist the user message (best-effort; don't block UX)
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role: "user",
          content: trimmed,
          stepId: activeStepId ?? null,
          taskId: activeTaskContext?.taskId ?? null,
        }),
      });
    } catch {
      // ignore persistence failures for now (LLM + UI should still work)
    }

    // 2) Build a minimal, safe context payload for the server
    const stepSpec = activeStepId ? getStepSpec(activeStepId) : null;

    const activeTaskId = activeTaskContext?.taskId ?? null;
    const activeTaskPayload = extractActiveTaskFromMissionData({
      missionData,
      activeTaskId,
    });

    const contextPreface = activeTaskContext
      ? `Context: User is asking about ${activeTaskContext.taskTitle}.\n\n`
      : "";

    const normalizeArtifactText = (value: string) =>
      value
        .replace(/\s*\d+\.\s+/g, "\n\n$&")
        .replace(/\s*[-•]\s+/g, "\n• ")
        .replace(/Tips:\s*/g, "\n\nTips:\n")
        .trim();

    // 3) Call the LLM route with intent=need_help
    try {
      const plan = await fetchLlmRenderPlan({
        intent: "need_help",
        userInput: {
          type: "text",
          value: `${contextPreface}${trimmed}`,
        },
        activeStepId: activeStepId ?? undefined,
        progress: {
          completedTaskIds: [],
        },
        stepSpec:
          stepSpec && activeTaskPayload
            ? {
                ...stepSpec,
                // Narrow to the active task if we can (keeps the model focused).
                tasks: (stepSpec.tasks ?? []).filter(
                  (t) => t.id === activeTaskPayload.taskId,
                ),
              }
            : (stepSpec ?? undefined),
      });

      const rawArtifacts = Array.isArray(plan?.artifacts) ? plan.artifacts : [];
      const nextHelpArtifacts = rawArtifacts
        .filter(
          (
            artifact,
          ): artifact is {
            kind?: string;
            data?: Record<string, unknown>;
            title?: string;
            headline?: string;
            name?: string;
            content?: string;
            body?: string;
            template?: string;
            items?: string[];
            bullets?: string[];
            examples?: string[];
            links?: Array<{ label?: string; url?: string }>;
          } =>
            typeof artifact === "object" &&
            artifact !== null &&
            "kind" in artifact &&
            ((artifact as { kind?: string }).kind === "template" ||
              (artifact as { kind?: string }).kind === "resource_links"),
        )
        .map((artifact) => {
          const data =
            artifact.data && typeof artifact.data === "object"
              ? artifact.data
              : {};
          const title =
            (artifact.title as string) ||
            (artifact.headline as string) ||
            (artifact.name as string) ||
            (data?.title as string) ||
            (data?.headline as string) ||
            (data?.name as string) ||
            (artifact.kind === "resource_links" ? "Helpful links" : "");
          const rawContent =
            (artifact.content as string) ||
            (artifact.body as string) ||
            (artifact.template as string) ||
            (data?.content as string) ||
            (data?.body as string) ||
            (data?.template as string) ||
            "";
          const content = rawContent ? normalizeArtifactText(rawContent) : "";
          const items =
            (artifact.items as string[]) ||
            (artifact.bullets as string[]) ||
            (artifact.examples as string[]) ||
            (data?.items as string[]) ||
            (data?.bullets as string[]) ||
            (data?.examples as string[]) ||
            [];
          const links =
            (artifact.links as Array<{ label?: string; url?: string }>) ||
            (data?.links as Array<{ label?: string; url?: string }>) ||
            [];
          return {
            id: `${String(artifact.kind)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: String(artifact.kind),
            title,
            content,
            items: Array.isArray(items) ? items : [],
            links: Array.isArray(links) ? links : [],
          };
        });

      if (nextHelpArtifacts.length > 0) {
        setHelpArtifacts((prev) => [...prev, ...nextHelpArtifacts]);
      }

      const assistantText =
        (plan?.messages ?? []).find(
          (m): m is { role: "assistant"; content: string } =>
            typeof m === "object" &&
            m !== null &&
            "role" in m &&
            (m as { role?: unknown }).role === "assistant" &&
            "content" in m &&
            typeof (m as { content?: unknown }).content === "string",
        )?.content ??
        "Got it. Tell me what you have so far, and I’ll refine it.";

      setMessages((prev) => [...prev, { role: "agent", text: assistantText }]);

      // 3.1) Persist the assistant message (best-effort)
      try {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            role: "assistant",
            content: assistantText,
            stepId: activeStepId ?? null,
            taskId: activeTaskContext?.taskId ?? null,
          }),
        });
      } catch {
        // ignore
      }
    } catch (err) {
      const fallback =
        "I couldn’t reach the assistant right now. Try sending that again in a moment.";
      setMessages((prev) => [...prev, { role: "agent", text: fallback }]);

      // Persist the fallback assistant message as well (optional, best-effort)
      try {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            role: "assistant",
            content: fallback,
            stepId: activeStepId ?? null,
            taskId: activeTaskContext?.taskId ?? null,
          }),
        });
      } catch {
        // ignore
      }
    } finally {
      setIsLoadingHelp(false);
    }
  };

  const triggerMissionReveal = () => {
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Thank you. That gives us clarity immediately.",
        },
      ]);

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            text: (
              <>
                Your Current Focus:{" "}
                <strong style={{ color: "var(--brand-terracotta)" }}>
                  FINDABLE
                </strong>
                <br />
                <br />
                Right now, your profile is leaking attention because it isn’t
                instantly clear. We’re going to fix that in 20 minutes.
              </>
            ),
          },
        ]);

        setTimeout(async () => {
          setShowMissionIntro(true);
          setIsBuildingStep(true);

          try {
            const route = await fetchLlmRenderPlan({
              intent: "route_next_step",
              userInput: { type: "action", value: "diagnostic_first_no" },
              progress: { completedTaskIds: [], completedStepIds: [] },
              availableSteps,
              diagnostic: { answers: diagnosticAnswers },
            });

            const selected = route?.selection?.selectedStepId ?? null;
            if (!selected) {
              throw new Error("Routing did not return a selectedStepId.");
            }

            setActiveStepId(selected);

            const selectedStepSpec = getStepSpec(selected);
            if (!selectedStepSpec) {
              throw new Error(`No step spec found for ${selected}.`);
            }

            const renderPlan = await fetchLlmRenderPlan({
              intent: "build_step_plan",
              userInput: { type: "action", value: "build_step_plan" },
              activeStepId: selected,
              progress: { completedTaskIds: [] },
              stepSpec: selectedStepSpec,
            });

            setMissionData(
              renderPlanToMissionData({
                stepSpec: selectedStepSpec,
                renderPlan,
              }),
            );
            setMessages((prev) => [
              ...prev,
              {
                role: "system",
                text: (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1rem",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "14px",
                        background: "rgba(255,255,255,0.28)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "0 0 auto",
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M9 11.5 11 13.5 15.5 9"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 800,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          marginBottom: "0.45rem",
                          opacity: 0.9,
                        }}
                      >
                        Your tasks are ready
                      </div>
                      <div
                        style={{
                          fontSize: "1.05rem",
                          lineHeight: 1.6,
                          fontWeight: 500,
                        }}
                      >
                        Your success path steps are created for you. Go through
                        each task and check it off as you complete it. You can
                        click the "Get help on this" button for each task to
                        chat with me about it here.
                      </div>
                    </div>
                  </div>
                ),
              },
            ]);
          } catch (err) {
            setMessages((prev) => [
              ...prev,
              {
                role: "agent",
                text: "I hit a snag building your plan. Reload and try again in a moment.",
              },
            ]);

            // No fallback: if the LLM fails, keep the workspace empty and show a clear error state.
            setActiveStepId(null);
            setMissionData(null);
          } finally {
            setIsBuildingStep(false);
          }
        }, 1500);
      }, 1000);
    }, 800);
  };

  const toggleTask = (taskId: string) => {
    setMissionData((prev) => {
      if (!prev) return prev;

      const newSteps = prev.steps.map((step) => {
        if (!step.tasks) return step;

        const newTasks = step.tasks.map((task) =>
          task.id === taskId ? { ...task, completed: !task.completed } : task,
        );

        return { ...step, tasks: newTasks };
      });

      return { ...prev, steps: newSteps };
    });
  };

  const focusWorkspaceNextIncomplete = () => {
    // v1: just scroll workspace to top to re-anchor; later we can scroll to next incomplete.
    workspaceScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGetHelpOnTask = (taskId: string, taskTitle: string) => {
    if (!activeStepId) return;
    setActiveTaskContext({ stepId: activeStepId, taskId, taskTitle });

    // Bring attention to the chat pane (v1: scroll to bottom)
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  if (isInitializing) {
    return <LoadingScreen onComplete={() => setIsInitializing(false)} />;
  }

  const currentQuestion = DIAGNOSTIC_QUESTIONS[currentQuestionIndex];

  // Calculate progress percentage
  let totalTasks = 0;
  let completedTasks = 0;

  if (missionData && missionData.steps) {
    missionData.steps.forEach((step) => {
      if (step.tasks) {
        totalTasks += step.tasks.length;
        completedTasks += step.tasks.filter((t) => t.completed).length;
      }
    });
  }

  const progressPercentage =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div
      className="container-chat"
      style={{
        // In split view we want to use the full viewport width (not the chat container max width)
        maxWidth: isExecutionMode ? "100vw" : undefined,
        width: "100%",
        margin: isExecutionMode ? 0 : undefined,
        paddingLeft: isExecutionMode ? 0 : undefined,
        paddingRight: isExecutionMode ? 0 : undefined,

        // Prevent whole-page scroll in split view; each pane scrolls independently.
        // (Phase 1 keeps the existing page scroll behavior.)
        height: isExecutionMode ? "100vh" : undefined,
        overflow: isExecutionMode ? "hidden" : undefined,

        paddingBottom: isExecutionMode
          ? undefined
          : canShowComposer
            ? "220px"
            : undefined,
      }}
    >
      {/* Phase 1: full-width chat onboarding/diagnostic */}
      {!isExecutionMode && (
        <>
          {showMissionIntro && (
            <ProgressTracker percentage={progressPercentage} />
          )}

          <AgentHeader />

          {messages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} delay={i * 100}>
              {msg.text}
            </ChatBubble>
          ))}

          {isDiagnosticActive && currentQuestion && (
            <div
              style={{
                marginTop: "4rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
              }}
            >
              <ChatBubble role="question" delay={200}>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    marginBottom: "1rem",
                    opacity: "0.8",
                  }}
                >
                  Diagnostic Question {currentQuestionIndex + 1}
                </span>
                {currentQuestion.text}
              </ChatBubble>
              <ChoiceButtons
                choices={currentQuestion.choices}
                onSelect={handleChoice}
              />
            </div>
          )}

          {showMissionIntro && (
            <div className="animate-in path-intro-card">
              <div className="path-badge">Your Personalized Roadmap</div>
              <span
                style={{
                  fontSize: "4rem",
                  display: "block",
                  marginBottom: "2rem",
                }}
              >
                🎯
              </span>
              <h2>
                Your 20-Minute{" "}
                <span className="serif-italic">Success Path</span>
              </h2>
              <p
                style={{
                  color: "var(--brand-terracotta)",
                  fontWeight: "800",
                  fontSize: "1.25rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  marginBottom: "2rem",
                }}
              >
                {missionData?.title}
              </p>
              <div
                style={{
                  maxWidth: "500px",
                  margin: "0 auto",
                  fontSize: "1.2rem",
                  opacity: "0.9",
                  lineHeight: "1.6",
                }}
              >
                No redesign. No overthinking.{" "}
                <strong style={{ color: "white" }}>Just clarity.</strong>
              </div>
            </div>
          )}

          {isBuildingStep && (
            <div
              className="premium-card animate-in"
              style={{ marginBottom: "2rem", opacity: 0.9 }}
            >
              <span className="tagline">Building your plan…</span>
              <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
                Generating your tasks
              </h2>
              <div style={{ color: "var(--text-muted)" }}>
                This takes a few seconds. Your Step + Tasks will load all at
                once.
              </div>
            </div>
          )}

          <div
            style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 2rem" }}
          >
            <ChatComposer
              value={composerText}
              onChange={setComposerText}
              onSend={handleComposerSend}
              disabled={isBuildingStep}
              isVisible={canShowComposer}
            />
          </div>
        </>
      )}

      {/* Phase 2: split view execution mode (persistent workspace + chat) */}
      {isExecutionMode && (
        <div
          className="splitViewGrid"
          style={{
            // Responsive split view:
            // - desktop: two columns (workspace + chat)
            // - smaller widths: stack (workspace above chat)
            display: "grid",
            gridTemplateColumns: "minmax(560px, 1.1fr) minmax(360px, 0.8fr)",
            gap: "2rem",
            alignItems: "stretch",

            // Use the full viewport "window" width so the chat doesn't get squeezed
            width: "100%",
            maxWidth: "min(1600px, calc(100vw - 2.5rem))",
            margin: "0 auto",
            padding: "0 1.25rem 1.25rem",

            // Fill the viewport height so the inner panes can scroll independently
            height: "100vh",
          }}
        >
          <style jsx>{`
            @media (max-width: 980px) {
              .splitViewGrid {
                grid-template-columns: 1fr !important;
                height: auto !important;
              }
              .splitViewWorkspace {
                height: auto !important;
                overflow: visible !important;
                min-width: 0 !important;
              }
              .splitViewChatPane {
                height: auto !important;
                overflow: visible !important;
                min-width: 0 !important;
              }
            }
          `}</style>
          {/* Shared top bar (spans entire split-view window) */}
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "0",
              marginBottom: "0.25rem",
              background: "transparent",
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
              }}
            >
              <AgentHeader variant="compact" />
            </div>

            <div
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
              }}
            >
              {showMissionIntro && (
                <ProgressTracker percentage={progressPercentage} />
              )}
            </div>
          </div>

          {/* Left: Step Workspace */}
          <div
            ref={workspaceScrollRef}
            className="splitViewWorkspace"
            style={{
              // Independent left-pane scroll
              position: "relative",
              height: "100%",
              overflow: "auto",
              paddingBottom: "1.25rem",

              // Keep workspace from collapsing too small or growing too wide
              minWidth: "520px",
            }}
          >
            <div className="premium-card" style={{ marginBottom: "1rem" }}>
              <span className="tagline">Step Workspace</span>
              <h2 style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>
                {missionData?.title ?? "Building your plan…"}
              </h2>
              <div style={{ color: "var(--text-muted)" }}>
                Keep this pane visible while you ask questions on the right.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  marginTop: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={focusWorkspaceNextIncomplete}
                  style={{
                    border: "1px solid var(--card-border)",
                    background: "transparent",
                    color: "var(--text-dark)",
                    padding: "0.65rem 0.9rem",
                    borderRadius: "999px",
                    cursor: "pointer",
                  }}
                >
                  Re-anchor
                </button>

                {activeTaskContext && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      border: "1px solid var(--card-border)",
                      borderRadius: "999px",
                      padding: "0.55rem 0.75rem",
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <span
                      style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}
                    >
                      Asking about:
                    </span>
                    <strong style={{ fontSize: "0.9rem" }}>
                      {activeTaskContext.taskTitle}
                    </strong>
                    <button
                      type="button"
                      onClick={() => setActiveTaskContext(null)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: "1rem",
                        lineHeight: 1,
                      }}
                      aria-label="Clear task context"
                      title="Clear task context"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>

            {isBuildingStep && (
              <>
                <div
                  className="premium-card animate-in"
                  style={{ marginBottom: "1rem", opacity: 0.9 }}
                >
                  <span className="tagline">Building your plan…</span>
                  <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>
                    Generating your tasks
                  </h2>
                  <div style={{ color: "var(--text-muted)" }}>
                    This takes a few seconds. Your Step + Tasks will load all at
                    once.
                  </div>
                </div>

                <div
                  className="premium-card animate-in"
                  style={{
                    marginBottom: "1rem",
                    opacity: 0.78,
                    padding: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: "0.9rem",
                    }}
                  >
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        style={{
                          borderRadius: "20px",
                          border: "1px solid var(--card-border)",
                          background: "rgba(107, 112, 92, 0.04)",
                          padding: "1.1rem 1rem",
                        }}
                      >
                        <div
                          className="skeleton-shimmer"
                          style={{
                            width: "120px",
                            height: "12px",
                            borderRadius: "999px",
                            background:
                              "linear-gradient(90deg, rgba(107, 112, 92, 0.08), rgba(107, 112, 92, 0.18), rgba(107, 112, 92, 0.08))",
                            marginBottom: "0.8rem",
                          }}
                        />
                        <div
                          className="skeleton-shimmer"
                          style={{
                            width: item === 2 ? "72%" : "64%",
                            height: "18px",
                            borderRadius: "999px",
                            background:
                              "linear-gradient(90deg, rgba(107, 112, 92, 0.10), rgba(107, 112, 92, 0.22), rgba(107, 112, 92, 0.10))",
                            marginBottom: "0.75rem",
                          }}
                        />
                        <div
                          className="skeleton-shimmer"
                          style={{
                            width: "100%",
                            height: "10px",
                            borderRadius: "999px",
                            background:
                              "linear-gradient(90deg, rgba(107, 112, 92, 0.07), rgba(107, 112, 92, 0.14), rgba(107, 112, 92, 0.07))",
                            marginBottom: "0.5rem",
                          }}
                        />
                        <div
                          className="skeleton-shimmer"
                          style={{
                            width: "84%",
                            height: "10px",
                            borderRadius: "999px",
                            background:
                              "linear-gradient(90deg, rgba(107, 112, 92, 0.07), rgba(107, 112, 92, 0.14), rgba(107, 112, 92, 0.07))",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {missionData &&
              missionData.steps.map((step) => (
                <div key={step.number} style={{ marginBottom: "1rem" }}>
                  <MissionStepCard
                    stepNumber={step.number}
                    title={step.title}
                    content={step.content}
                    examples={step.examples}
                    tasks={step.tasks}
                    onToggleTask={toggleTask}
                    onGetHelp={() =>
                      handleGetHelpOnTask(
                        (step?.tasks?.[0]?.id ??
                          step?.tasks?.[0]?.taskId ??
                          `task_${step.number}`) as string,
                        `Task ${step.number} — ${step.title}`,
                      )
                    }
                  />
                </div>
              ))}

            {missionData && (
              <div
                className="animate-in"
                style={{
                  textAlign: "center",
                  marginTop: "2rem",
                  padding: "2rem",
                  borderTop: "1px solid var(--card-border)",
                }}
              >
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "1.05rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  When this is done, your profile will convert curiosity into
                  action instead of confusion.
                </p>
                <div
                  style={{
                    background: "var(--brand-olive)",
                    color: "white",
                    padding: "1.25rem 1.5rem",
                    borderRadius: "24px",
                    display: "inline-block",
                    fontWeight: "600",
                  }}
                >
                  🎉 You completed your highest leverage action for this week.
                </div>
                <p
                  style={{
                    marginTop: "1.5rem",
                    color: "var(--brand-sage)",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    fontSize: "0.8rem",
                  }}
                >
                  Stay focused here before moving to the next pillar.
                </p>
              </div>
            )}
          </div>

          {/* Right: Persistent Chat Pane */}
          <div
            className="splitViewChatPane"
            style={{
              // Independent right-pane scroll (messages scroll, composer stays pinned inside pane)
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",

              // Critical for scroll-in-flex layouts:
              // allow the messages area to shrink so its own overflow can scroll.
              minHeight: 0,

              // Ensure chat pane has enough room to feel like a real conversation area
              minWidth: "360px",
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(255,255,255,0.6)",
              borderRadius: "20px",
              backdropFilter: "blur(6px)",
            }}
          >
            <div
              ref={chatScrollRef}
              style={{
                flex: 1,
                // Required so this child can actually become the scrolling region
                // inside a flex column with overflow constraints.
                minHeight: 0,

                overflowY: "auto",
                overscrollBehavior: "contain",
                padding: "0 0.25rem",

                // Ensure the pinned composer doesn't overlap the last messages
                paddingBottom: "220px",
              }}
            >
              {messages.map((msg, i) => (
                <ChatBubble key={i} role={msg.role} delay={i * 50}>
                  {msg.text}
                </ChatBubble>
              ))}

              {helpArtifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="premium-card animate-in"
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1.5rem",
                    boxShadow: "var(--shadow-soft)",
                    background:
                      artifact.kind === "template"
                        ? "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,248,244,0.92))"
                        : "white",
                  }}
                >
                  {artifact.title && (
                    <h4 style={{ fontSize: "1.2rem", marginBottom: "0.9rem" }}>
                      {artifact.title}
                    </h4>
                  )}

                  {artifact.content && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        marginBottom:
                          artifact.items && artifact.items.length > 0
                            ? "1rem"
                            : "0",
                        whiteSpace: "pre-line",
                        lineHeight: 1.75,
                      }}
                    >
                      {artifact.content}
                    </div>
                  )}

                  {artifact.items && artifact.items.length > 0 && (
                    <ul
                      style={{
                        paddingLeft: "1.2rem",
                        marginBottom: artifact.links?.length ? "1rem" : "0",
                      }}
                    >
                      {artifact.items.map((item, idx) => (
                        <li
                          key={idx}
                          style={{
                            marginBottom: "0.65rem",
                            color: "var(--text-dark)",
                            lineHeight: 1.6,
                          }}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}

                  {artifact.links && artifact.links.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                        marginTop:
                          artifact.content || artifact.items?.length
                            ? "0.75rem"
                            : "0",
                      }}
                    >
                      {artifact.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "var(--brand-olive)",
                            fontWeight: 600,
                            textDecoration: "underline",
                          }}
                        >
                          {link.label || link.url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isLoadingHelp && (
                <div
                  className="premium-card animate-in"
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1.5rem",
                    opacity: 0.85,
                  }}
                >
                  <div
                    className="skeleton-shimmer"
                    style={{
                      width: "180px",
                      height: "18px",
                      borderRadius: "999px",
                      background:
                        "linear-gradient(90deg, rgba(199, 125, 93, 0.12), rgba(199, 125, 93, 0.24), rgba(199, 125, 93, 0.12))",
                      marginBottom: "1rem",
                    }}
                  />
                  <div
                    className="skeleton-shimmer"
                    style={{
                      width: "100%",
                      height: "12px",
                      borderRadius: "999px",
                      background:
                        "linear-gradient(90deg, rgba(107, 112, 92, 0.08), rgba(107, 112, 92, 0.18), rgba(107, 112, 92, 0.08))",
                      marginBottom: "0.65rem",
                    }}
                  />
                  <div
                    className="skeleton-shimmer"
                    style={{
                      width: "92%",
                      height: "12px",
                      borderRadius: "999px",
                      background:
                        "linear-gradient(90deg, rgba(107, 112, 92, 0.08), rgba(107, 112, 92, 0.18), rgba(107, 112, 92, 0.08))",
                      marginBottom: "0.65rem",
                    }}
                  />
                  <div
                    className="skeleton-shimmer"
                    style={{
                      width: "78%",
                      height: "12px",
                      borderRadius: "999px",
                      background:
                        "linear-gradient(90deg, rgba(107, 112, 92, 0.08), rgba(107, 112, 92, 0.18), rgba(107, 112, 92, 0.08))",
                    }}
                  />
                </div>
              )}

              {/* Keep diagnostic question UI only in phase 1 */}
            </div>

            <div
              style={{
                // Pin composer to the bottom of the RIGHT CHAT PANE (not the page)
                position: "sticky",
                bottom: 0,
                paddingTop: "0.75rem",
                paddingBottom: "0.5rem",
                // Keep only a subtle fade so content feels grounded, but remove the extra "container" card
                background:
                  "linear-gradient(to bottom, rgba(248,245,239,0), rgba(248,245,239,0.88) 30%, rgba(248,245,239,1))",
                zIndex: 30,
              }}
            >
              <div style={{ padding: "0 0.25rem" }}>
                {activeTaskContext && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "14px",
                      border: "1px solid var(--card-border)",
                      background: "rgba(0,0,0,0.02)",
                      marginBottom: "0.65rem",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        You’re asking about:
                      </span>
                      <strong style={{ fontSize: "0.95rem" }}>
                        {activeTaskContext.taskTitle}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTaskContext(null)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: "1.2rem",
                        lineHeight: 1,
                      }}
                      aria-label="Remove task context"
                      title="Remove task context"
                    >
                      ×
                    </button>
                  </div>
                )}

                <ChatComposer
                  value={composerText}
                  onChange={setComposerText}
                  onSend={handleComposerSend}
                  disabled={isBuildingStep}
                  isVisible={canShowComposer}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
