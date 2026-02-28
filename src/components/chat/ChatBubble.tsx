import type { ReactNode } from "react";

type ChatBubbleRole = "agent" | "question" | "user";

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

  let bubbleClass = "agent-bubble";
  if (!isAgent && !isQuestion) bubbleClass = "user-bubble";
  if (isQuestion) bubbleClass = "question-bubble";

  return (
    <div
      className={`animate-in ${bubbleClass}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
