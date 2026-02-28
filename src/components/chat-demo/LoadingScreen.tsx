"use client";

import { useEffect, useState } from "react";

type LoadingScreenProps = {
  onComplete: () => void;
};

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true);
      setTimeout(onComplete, 800); // Match globals.css slow transition
    }, 5000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`initial-loader ${isFading ? "fade-out" : ""}`}>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ marginBottom: "2rem" }}>
          <svg width="60" height="60" viewBox="0 0 100 100" fill="none">
            <path
              className="logo-inner"
              d="M50 8L12 30V70L50 92L88 70V30L50 8Z"
              strokeWidth="2"
              stroke="var(--brand-olive)"
            />
            <circle cx="50" cy="50" r="4" fill="var(--brand-terracotta)" />
          </svg>
        </div>

        <div className="logo-reveal">Initializing Success Path</div>

        <div className="loading-bar-container">
          <div className="loading-bar-fill"></div>
        </div>

        <div
          style={{
            marginTop: "2rem",
            fontSize: "0.8rem",
            color: "var(--brand-sage)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: "600",
          }}
        >
          Analyzing Growth Pillars...
        </div>
      </div>
    </div>
  );
}
