"use client";

import { useMemo, useState } from "react";
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
  onGetHelp?: () => void;
};

export default function MissionStepCard({
  stepNumber,
  title,
  content,
  examples,
  tasks,
  isCompleted,
  onToggleTask,
  onGetHelp,
}: MissionStepCardProps) {
  const allChecklistDone = useMemo(() => {
    if (!tasks || tasks.length === 0) return false;
    return tasks.every((t) => Boolean(t.completed));
  }, [tasks]);

  // Derived default:
  // - unchecked => expanded
  // - all checked => collapsed
  //
  // Manual override is only used when user explicitly toggles details while checked.
  const [manualDetailsExpanded, setManualDetailsExpanded] = useState<
    boolean | null
  >(null);

  const isDetailsExpanded = useMemo(() => {
    if (!allChecklistDone) return true; // always expanded when not complete
    return manualDetailsExpanded ?? false; // collapsed by default when complete
  }, [allChecklistDone, manualDetailsExpanded]);

  const canToggleDetails =
    (Boolean(content) || (examples && examples.length > 0)) && allChecklistDone;

  return (
    <div className="premium-card animate-in" style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "0.5rem",
        }}
      >
        <span className="tagline" style={{ marginBottom: 0 }}>
          Task {stepNumber}
        </span>

        <button
          type="button"
          onClick={() => onGetHelp?.()}
          style={{
            border: "1px solid var(--brand-terracotta)",
            background: "var(--brand-terracotta)",
            color: "white",
            padding: "0.5rem 0.9rem",
            borderRadius: "999px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.85rem",
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            boxShadow: "0 8px 18px rgba(199, 125, 93, 0.25)",
          }}
          title="Get help on this"
          aria-label="Get help on this"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            style={{ display: "block" }}
          >
            <path
              d="M4 6.5A4.5 4.5 0 0 1 8.5 2h7A4.5 4.5 0 0 1 20 6.5v5A4.5 4.5 0 0 1 15.5 16H9l-4 4v-4.5A4.5 4.5 0 0 1 4 11.5v-5z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Get help</span>
          <span style={{ fontSize: "1rem", lineHeight: 1 }}>→</span>
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <h2 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          {title}
        </h2>

        {canToggleDetails && (
          <button
            type="button"
            onClick={() => setManualDetailsExpanded((v) => !(v ?? false))}
            style={{
              border: "1px solid var(--card-border)",
              background: "transparent",
              color: "var(--text-dark)",
              padding: "0.5rem 0.75rem",
              borderRadius: "999px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              opacity: 0.9,
            }}
            aria-expanded={isDetailsExpanded}
            aria-controls={`task-details-${stepNumber}`}
            title={isDetailsExpanded ? "Collapse details" : "Expand details"}
          >
            {isDetailsExpanded ? "Hide details" : "Show details"}
          </button>
        )}
      </div>

      <div
        id={`task-details-${stepNumber}`}
        style={{
          display: isDetailsExpanded ? "block" : "none",
          marginTop: "0.75rem",
        }}
      >
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
      </div>

      {tasks && (
        <div style={{ marginTop: "1.25rem" }}>
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
                marginBottom: "0.5rem",
                background: task.completed
                  ? "rgba(107, 112, 92, 0.12)"
                  : "rgba(107, 112, 92, 0.04)",
              }}
            >
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => {
                  // If something becomes unchecked, revert to derived expanded state by clearing manual override.
                  if (task.completed) setManualDetailsExpanded(null);
                  onToggleTask(task.id ?? task.taskId ?? `${stepNumber}-${i}`);
                }}
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
