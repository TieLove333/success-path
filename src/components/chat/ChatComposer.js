"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * @typedef {"primary"|"secondary"|"ghost"} ChatComposerQuickActionStyle
 *
 * @typedef {Object} ChatComposerQuickAction
 * @property {string} id
 * @property {string} label
 * @property {string} value
 * @property {ChatComposerQuickActionStyle=} style
 *
 * @typedef {Object} ChatComposerProps
 * @property {string} value
 * @property {(nextValue: string) => void} onChange
 * @property {(text: string) => void} onSend
 * @property {boolean=} disabled
 * @property {string=} placeholder
 * @property {boolean=} isVisible

 * @property {number=} maxLength
 */

/**
 * ChatComposer
 * - Sticky to bottom of the viewport (or nearest scroll container)
 * - On-brand styling using existing CSS variables
 *
 * Props:
 * - value: string
 * - onChange: (nextValue: string) => void
 * - onSend: (text: string) => void
 * - disabled?: boolean
 * - placeholder?: string
 * - isVisible?: boolean (default true)
 * - maxLength?: number
 */
/** @param {ChatComposerProps} props */
export default function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Ask a question, or say “what next?”",
  isVisible = true,
  maxLength = 1200,
}) {
  const textareaRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const trimmed = (value ?? "").trim();
  const canSend = !disabled && trimmed.length > 0;

  const containerStyle = useMemo(
    () => ({
      position: "sticky",
      bottom: 0,
      width: "100%",
      zIndex: 20,
      padding: "1.25rem 0 2rem",
      background:
        "linear-gradient(to top, rgba(245, 244, 240, 0.98), rgba(245, 244, 240, 0.7), rgba(245, 244, 240, 0))",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
    }),
    [],
  );

  const cardStyle = useMemo(
    () => ({
      width: "100%",
      borderRadius: "24px",
      border: "1px solid var(--card-border)",
      background: "rgba(255, 255, 255, 0.75)",
      boxShadow: isFocused
        ? "0 22px 60px rgba(0,0,0,0.14)"
        : "0 18px 50px rgba(0,0,0,0.10)",
      transition: "var(--transition-standard)",
      overflow: "hidden",
    }),
    [isFocused],
  );

  const innerStyle = useMemo(
    () => ({
      padding: "1rem 1rem 0.9rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
    }),
    [],
  );

  const rowStyle = useMemo(
    () => ({
      display: "flex",
      alignItems: "flex-end",
      gap: "0.75rem",
    }),
    [],
  );

  const textareaStyle = useMemo(
    () => ({
      flex: 1,
      width: "100%",
      minHeight: "48px",
      maxHeight: "140px",
      resize: "none",
      border: "none",
      outline: "none",
      background: "transparent",
      color: "var(--text-dark)",
      fontSize: "1.05rem",
      lineHeight: "1.45",
      padding: "0.35rem 0.25rem",
      fontFamily: "inherit",
    }),
    [],
  );

  const sendButtonStyle = useMemo(
    () => ({
      border: "none",
      cursor: canSend ? "pointer" : "not-allowed",
      borderRadius: "16px",
      padding: "0.85rem 1rem",
      fontWeight: 700,
      letterSpacing: "0.02em",
      transition: "var(--transition-standard)",
      background: canSend ? "var(--brand-olive)" : "rgba(0,0,0,0.08)",
      color: canSend ? "white" : "rgba(0,0,0,0.35)",
      minWidth: "84px",
      boxShadow: canSend ? "0 12px 28px rgba(107,112,92,0.25)" : "none",
    }),
    [canSend],
  );

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  useEffect(() => {
    autoResize();
  }, [value]);

  const handleSend = () => {
    if (!canSend) return;
    onSend?.(trimmed);
    onChange?.("");
    // keep focus for rapid follow-ups
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const onKeyDown = (e) => {
    if (disabled) return;

    // Enter sends; Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isVisible) return null;

  return (
    <div style={containerStyle} aria-label="Chat composer">
      <div style={cardStyle}>
        <div style={innerStyle}>
          <div style={rowStyle}>
            <textarea
              ref={textareaRef}
              value={value ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                if (next.length > maxLength) return;
                onChange?.(next);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={disabled}
              style={textareaStyle}
              rows={1}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              style={sendButtonStyle}
              aria-label="Send message"
              title="Send (Enter)"
            >
              Send
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0 0.25rem 0.2rem",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
              opacity: 0.9,
            }}
          >
            <span>
              Press <strong>Enter</strong> to send • <strong>Shift</strong>+
              <strong>Enter</strong> for a new line
            </span>
            <span>
              {(value?.length ?? 0).toLocaleString()}/
              {maxLength.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
