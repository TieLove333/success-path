type ProgressTrackerProps = {
  percentage: number;
};

export default function ProgressTracker({ percentage }: ProgressTrackerProps) {
  // Ensure percentage is rounded and within bounds
  const displayPercentage = Math.round(Math.min(Math.max(percentage, 0), 100));

  return (
    <div
      className="animate-in"
      style={{
        position: "fixed",
        top: "0.5rem",
        right: "0.5rem",
        background: "white",
        border: "1px solid var(--card-border)",
        borderRadius: "24px",
        padding: "1.25rem 1.5rem",
        boxShadow: "var(--shadow-elegant)",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        zIndex: 100,
        minWidth: "240px",
      }}
    >
      <div style={{ flexGrow: 1 }}>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--brand-terracotta)",
            marginBottom: "0.5rem",
          }}
        >
          Path Progress
        </div>

        {/* Progress Bar Track */}
        <div
          style={{
            width: "100%",
            height: "6px",
            background: "var(--bg-warm)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          {/* Progress Bar Fill */}
          <div
            style={{
              height: "100%",
              width: `${displayPercentage}%`,
              background: "var(--brand-olive)",
              transition: "width 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
              borderRadius: "4px",
            }}
          />
        </div>
      </div>

      {/* Percentage Text */}
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: "700",
          fontFamily: "var(--font-heading)",
          color: "var(--text-dark)",
        }}
      >
        {displayPercentage}%
      </div>
    </div>
  );
}
