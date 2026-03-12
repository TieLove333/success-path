import type { ReactNode } from "react";

type ChatBubbleRole = "agent" | "question" | "user" | "system";

type ChatBubbleProps = {
  role: ChatBubbleRole;
  children: ReactNode;
  delay?: number;
};

export default function ChatBubble({
  role,
  children,
  delay = 0,
}: ChatBubbleProps) {
  const isAgent = role === "agent";
  const isQuestion = role === "question";
  const isSystem = role === "system";

  let bubbleClass = "agent-bubble";
  if (!isAgent && !isQuestion && !isSystem) bubbleClass = "user-bubble";
  if (isQuestion) bubbleClass = "question-bubble";
  if (isSystem) bubbleClass = "system-bubble";

  return (
    <div
      className={`animate-in ${bubbleClass}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
