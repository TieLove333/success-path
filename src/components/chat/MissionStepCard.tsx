"use client";

import type { ReactNode } from "react";
import type { MissionTask } from "@/types/chat";

type MissionStepCardProps = {
  stepNumber: number;
  title: string;
  content: string | ReactNode;
  examples?: string[];
  tasks?: MissionTask[];
  isCompleted?: boolean;
  onToggleTask: (taskId: string) => void;
};

export default function MissionStepCard({
  stepNumber,
  title,
  content,
  examples,
  tasks,
  isCompleted,
  onToggleTask,
}: MissionStepCardProps) {
  return (
    <div className="premium-card animate-in" style={{ marginBottom: "2rem" }}>
      <span className="tagline">Task {stepNumber}</span>
      <h2 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>{title}</h2>

      <div style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        {content}
      </div>

      {examples && (
        <div
          style={{
            background: "var(--bg-warm)",
            padding: "1.5rem",
            borderRadius: "16px",
            marginBottom: "1.5rem",
            border: "1px solid var(--card-border)",
          }}
        >
          <p
            style={{
              fontWeight: "600",
              marginBottom: "0.75rem",
              fontSize: "0.9rem",
              textTransform: "uppercase",
            }}
          >
            Examples:
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {examples.map((ex, i) => (
              <li
                key={i}
                style={{
                  marginBottom: "0.5rem",
                  display: "flex",
                  gap: "0.5rem",
                  whiteSpace: "pre-wrap",
                }}
              >
                <span style={{ color: "var(--brand-terracotta)" }}>•</span>
                {ex}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tasks && (
        <div style={{ marginTop: "2rem" }}>
          {tasks.map((task, i) => (
            <label
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                cursor: "pointer",
                padding: "0.75rem",
                borderRadius: "12px",
                transition: "var(--transition-standard)",
                background: task.completed
                  ? "rgba(107, 112, 92, 0.05)"
                  : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() =>
                  onToggleTask(task.id ?? task.taskId ?? `${stepNumber}-${i}`)
                }
                style={{
                  width: "20px",
                  height: "20px",
                  accentColor: "var(--brand-olive)",
                  cursor: "pointer",
                }}
              />
              <span
                style={{
                  fontSize: "1.1rem",
                  textDecoration: task.completed ? "line-through" : "none",
                  color: task.completed
                    ? "var(--text-muted)"
                    : "var(--text-dark)",
                }}
              >
                {task.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
