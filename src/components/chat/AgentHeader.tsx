type AgentHeaderProps = {
  variant?: "hero" | "compact";
};

export default function AgentHeader({ variant = "hero" }: AgentHeaderProps) {
  return (
    <div
      className="animate-in"
      style={{
        display: "flex",
        flexDirection: variant === "compact" ? "row" : "column",
        alignItems: variant === "compact" ? "flex-start" : "center",
        textAlign: variant === "compact" ? "left" : "center",
        justifyContent: variant === "compact" ? "flex-start" : "center",
        gap: variant === "compact" ? "1rem" : undefined,
        marginBottom: variant === "compact" ? "0" : "6rem",
        paddingTop: variant === "compact" ? "0" : "2rem",
        marginTop: variant === "compact" ? "-0.35rem" : undefined,
      }}
    >
      <div
        className="logo-container"
        style={{
          width: variant === "compact" ? "52px" : "120px",
          height: variant === "compact" ? "52px" : "120px",
          borderRadius: "50%",
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-soft)",
          border: "1px solid var(--card-border)",
          marginBottom: variant === "compact" ? "0" : "2.5rem",
          flex: "0 0 auto",
          position: "relative",
          cursor: "pointer",
          transition: "var(--transition-standard)",
        }}
      >
        {/* Premium Brand Mark (Modernized Cube/Path) */}
        <svg
          width={variant === "compact" ? "28" : "60"}
          height={variant === "compact" ? "28" : "60"}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="logo-inner"
            d="M50 8L12 30V70L50 92L88 70V30L50 8Z"
            strokeWidth="2"
            stroke="currentColor"
          />
          <path
            className="logo-inner"
            d="M50 8V50L88 30"
            strokeWidth="1.5"
            stroke="currentColor"
            opacity="0.6"
          />
          <path
            className="logo-inner"
            d="M50 50L12 30"
            strokeWidth="1.5"
            stroke="currentColor"
            opacity="0.6"
          />
          <path
            className="logo-inner"
            d="M50 50V92"
            strokeWidth="1.5"
            stroke="currentColor"
            opacity="0.6"
          />
          <circle cx="50" cy="50" r="4" fill="var(--brand-terracotta)" />
        </svg>

        {/* Orbital Ring Decoration */}
        <div
          style={{
            position: "absolute",
            inset: "-10px",
            border: "1px solid var(--brand-sage)",
            borderRadius: "50%",
            opacity: "0.2",
            animation: "logoPulse 4s infinite ease-in-out",
          }}
        />
      </div>

      <div
        style={{
          maxWidth: variant === "compact" ? "520px" : "600px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: variant === "compact" ? "0.1rem" : undefined,
        }}
      >
        <h1
          style={{
            fontSize: variant === "compact" ? "1.35rem" : "2.5rem",
            marginBottom: variant === "compact" ? "0.15rem" : "1rem",
            color: "var(--text-dark)",
            fontFamily: "var(--font-serif)",
            textTransform: "none",
            letterSpacing: "-0.02em",
            fontWeight: "500",
            lineHeight: variant === "compact" ? "1.15" : undefined,
          }}
        >
          Social Media <span className="serif-italic">Success Path</span>
        </h1>
        <div
          style={{
            width: variant === "compact" ? "28px" : "40px",
            height: "2px",
            background: "var(--brand-terracotta)",
            margin: variant === "compact" ? "0.4rem 0 0" : "1.5rem auto",
            opacity: "0.5",
          }}
        />
        {variant !== "compact" && (
          <p
            style={{
              fontSize: "1.25rem",
              color: "var(--text-muted)",
              fontWeight: "400",
              lineHeight: "1.4",
            }}
          >
            Stop guessing and start{" "}
            <span style={{ color: "var(--text-dark)", fontWeight: "600" }}>
              compounding
            </span>{" "}
            visibility that produces predictable leads.
          </p>
        )}
      </div>
    </div>
  );
}
