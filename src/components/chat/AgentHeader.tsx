type AgentHeaderProps = Record<string, never>;

export default function AgentHeader({}: AgentHeaderProps) {
  return (
    <div
      className="animate-in"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        marginBottom: "6rem",
        paddingTop: "2rem",
      }}
    >
      <div
        className="logo-container"
        style={{
          width: "120px",
          height: "120px",
          borderRadius: "50%",
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-soft)",
          border: "1px solid var(--card-border)",
          marginBottom: "2.5rem",
          position: "relative",
          cursor: "pointer",
          transition: "var(--transition-standard)",
        }}
      >
        {/* Premium Brand Mark (Modernized Cube/Path) */}
        <svg
          width="60"
          height="60"
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

      <div style={{ maxWidth: "600px" }}>
        <span className="tagline">The Simple Rhythm</span>
        <h1
          style={{
            fontSize: "2.5rem",
            marginBottom: "1rem",
            color: "var(--text-dark)",
            fontFamily: "var(--font-serif)",
            textTransform: "none",
            letterSpacing: "-0.02em",
            fontWeight: "500",
          }}
        >
          Social Media <span className="serif-italic">Success Path</span>
        </h1>
        <div
          style={{
            width: "40px",
            height: "2px",
            background: "var(--brand-terracotta)",
            margin: "1.5rem auto",
            opacity: "0.5",
          }}
        />
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
      </div>
    </div>
  );
}
