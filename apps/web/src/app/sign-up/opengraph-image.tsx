import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Sign up for Beast - Hire your first AI employee in 90 seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "linear-gradient(135deg, oklch(0.98 0.005 260) 0%, oklch(0.95 0.02 260) 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            B
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#0a0a0a" }}>
            Beast
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 22,
              color: "#525252",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Sign up
          </div>
          <div
            style={{
              fontSize: 80,
              fontWeight: 800,
              color: "#0a0a0a",
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
            }}
          >
            Hire your first
            <br />
            AI employee.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#525252",
              maxWidth: 1000,
              lineHeight: 1.4,
            }}
          >
            Ninety seconds, three questions, real deliverables. No credits, no per-task fees.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              padding: "16px 28px",
              borderRadius: 14,
              background: "#0a0a0a",
              color: "white",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Get started for free
          </div>
          <div style={{ fontSize: 18, color: "#525252", fontWeight: 500 }}>
            No credit card. Two-minute setup.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
