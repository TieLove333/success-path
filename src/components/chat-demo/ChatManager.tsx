"use client";

import { useEffect, useState } from "react";
import AgentHeader from "./AgentHeader";
import ChatBubble from "./ChatBubble";
import ChoiceButtons from "./ChoiceButtons";
import MissionStepCard from "./MissionStepCard";
import LoadingScreen from "./LoadingScreen";
import ProgressTracker from "./ProgressTracker";
import type {
  ChatMessage,
  ChoiceItem,
  DiagnosticQuestion,
  MissionData,
} from "@/types/chat";

const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "q1",
    text: "If someone landed on your Instagram profile today, would they instantly understand who you help and how to contact you?",
    choices: [
      { id: "y1", label: "Yes" },
      { id: "n1", label: "No" },
    ],
  },
  {
    id: "q2",
    text: "Is your 'Name Field' optimized with keywords that your ideal client is actually searching for?",
    choices: [
      { id: "y2", label: "Yes" },
      { id: "n2", label: "No" },
    ],
  },
  {
    id: "q3",
    text: "Does your bio contain a direct Call to Action (CTA) that tells people exactly what to do next?",
    choices: [
      { id: "y3", label: "Yes" },
      { id: "n3", label: "No" },
    ],
  },
  {
    id: "q4",
    text: "Are your contact buttons and 'Link in Bio' fully functional and friction-free?",
    choices: [
      { id: "y4", label: "Yes" },
      { id: "n4", label: "No" },
    ],
  },
];

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

  useEffect(() => {
    if (!isInitializing) {
      const timer = setTimeout(() => setIsDiagnosticActive(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isInitializing]);

  const handleChoice = (choice: ChoiceItem) => {
    setMessages((prev) => [...prev, { role: "user", text: choice.label }]);

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
                Right now, your profile is leaking attention because it isn't
                instantly clear. We're going to fix that in 20 minutes.
              </>
            ),
          },
        ]);

        setTimeout(() => {
          setShowMissionIntro(true);
          setMissionData({
            title: "Optimize Your Instagram Bio",
            subtitle: "Clearly state who you help and how to work with you.",
            steps: [
              {
                number: 1,
                title: "Define Your Niche in One Sentence",
                content:
                  'Answer this: "I help ______ in ______ do/buy/sell ______."',
                examples: [
                  "I help first-time buyers in Dallas purchase confidently.",
                  "I help growing families in Phoenix upgrade without financial stress.",
                  "I help out-of-state buyers relocate to Nashville smoothly.",
                ],
                tasks: [
                  { label: "Write your niche statement", completed: false },
                ],
              },
              {
                number: 2,
                title: "Add a Keyword to Your Name Field",
                content:
                  "Your name field is searchable. Instead of 'Jane Smith', use a descriptive title.",
                examples: [
                  "Jane Smith | Dallas Realtor",
                  "Jane Smith | Phoenix Family Homes",
                ],
                tasks: [
                  {
                    label: "Update Instagram Name field with keyword",
                    completed: false,
                  },
                ],
              },
              {
                number: 3,
                title: "Write a Clear Bio Statement",
                content: (
                  <>
                    Use this structure:
                    <br />
                    Line 1: Who you help
                    <br />
                    Line 2: How you help
                    <br />
                    Line 3: Credibility or differentiator
                    <br />
                    Line 4: Clear call to action
                  </>
                ),
                examples: [
                  "Helping first-time buyers in Dallas\nSimplifying the home buying process\nLocal market expert | 120+ homes sold\n⬇️ Grab your free Buyer Guide",
                ],
                tasks: [
                  { label: "Structure your new bio text", completed: false },
                ],
              },
              {
                number: 4,
                title: "Add a Direct Call to Action",
                content:
                  "Your bio must tell people what to do next. If there is no CTA, attention dies.",
                examples: [
                  "Download the free relocation guide",
                  "DM me 'BUY' to start",
                  "Book a consult below",
                  "Get the buyer checklist",
                ],
                tasks: [{ label: "Add CTA to bio and link", completed: false }],
              },
              {
                number: 5,
                title: "Confirm Contact Is Visible",
                content:
                  "No friction. Make sure your email button is active and your link works.",
                tasks: [
                  { label: "Verify Email button is active", completed: false },
                  {
                    label: "Test 'Link in Bio' functionality",
                    completed: false,
                  },
                ],
              },
            ],
          });
        }, 1500);
      }, 1000);
    }, 800);
  };

  const toggleTask = (stepNum: number, taskIdx: number) => {
    setMissionData((prev) => {
      if (!prev) return prev;
      const newSteps = [...prev.steps];
      const stepIdx = newSteps.findIndex((s) => s.number === stepNum);
      if (stepIdx === -1) return prev;
      const tasks = newSteps[stepIdx].tasks;
      if (!tasks) return prev;
      const newTasks = [...tasks];
      if (!newTasks[taskIdx]) return prev;
      newTasks[taskIdx] = {
        ...newTasks[taskIdx],
        completed: !newTasks[taskIdx].completed,
      };
      newSteps[stepIdx] = { ...newSteps[stepIdx], tasks: newTasks };
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
