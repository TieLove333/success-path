"use client";

import { useEffect, useState } from "react";
import AgentHeader from "./AgentHeader";
import ChatBubble from "./ChatBubble";
import ChoiceButtons from "./ChoiceButtons";
import MissionStepCard from "./MissionStepCard";
import LoadingScreen from "./LoadingScreen";
import ProgressTracker from "./ProgressTracker";
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
          } catch (err) {
            setMessages((prev) => [
              ...prev,
              {
                role: "agent",
                text: "I hit a snag building your plan. Reload and try again, or continue with the default step outline.",
              },
            ]);

            // Fallback to the first available step spec (m1.s01) if routing/build fails
            const fallbackStepId = availableSteps?.[0]?.id ?? null;
            const fallbackStepSpec = fallbackStepId
              ? getStepSpec(fallbackStepId)
              : null;

            if (fallbackStepSpec) {
              setActiveStepId(fallbackStepId);
              setMissionData(
                renderPlanToMissionData({
                  stepSpec: fallbackStepSpec,
                  renderPlan: {
                    messages: [],
                    artifacts: (fallbackStepSpec?.artifacts ?? []).flatMap(
                      (a) => {
                        if (!a || !a.kind) return [];
                        if (a.kind === "task_card") {
                          return [
                            {
                              id: a.id,
                              kind: "task_card",
                              ...(a.data ?? {}),
                            },
                          ];
                        }
                        if (a.kind === "step_hero") {
                          return [
                            {
                              id: a.id,
                              kind: "step_hero",
                              ...(a.data ?? {}),
                            },
                          ];
                        }
                        return [{ id: a.id, kind: a.kind, ...(a.data ?? {}) }];
                      },
                    ),
                  },
                }),
              );
            }
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
    <div className="container-chat">
      {showMissionIntro && <ProgressTracker percentage={progressPercentage} />}

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
            style={{ fontSize: "4rem", display: "block", marginBottom: "2rem" }}
          >
            🎯
          </span>
          <h2>
            Your 20-Minute <span className="serif-italic">Success Path</span>
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
            This takes a few seconds. Your Step + Tasks will load all at once.
          </div>
        </div>
      )}
      {missionData &&
        missionData.steps.map((step) => (
          <MissionStepCard
            key={step.number}
            stepNumber={step.number}
            title={step.title}
            content={step.content}
            examples={step.examples}
            tasks={step.tasks}
            onToggleTask={toggleTask}
          />
        ))}

      {missionData && (
        <div
          className="animate-in"
          style={{
            textAlign: "center",
            marginTop: "6rem",
            padding: "3rem",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "1.1rem",
              marginBottom: "1.5rem",
            }}
          >
            When this is done, your profile will convert curiosity into action
            instead of confusion.
          </p>
          <div
            style={{
              background: "var(--brand-olive)",
              color: "white",
              padding: "1.5rem 2rem",
              borderRadius: "24px",
              display: "inline-block",
              fontWeight: "600",
            }}
          >
            🎉 You completed your highest leverage action for this week.
          </div>
          <p
            style={{
              marginTop: "2rem",
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
  );
}
