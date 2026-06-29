import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Beast - Hire your first AI employee in 90 seconds";
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
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            B
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#0a0a0a" }}>
            Beast
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: "#0a0a0a",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Sintra suggests.
            <br />
            Alex finishes.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#525252",
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            AI marketing, sales, and support employees that produce real deliverables, learn your voice, and keep you accountable.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 999,
              background: "rgba(232, 123, 53, 0.12)",
              color: "#7c2d12",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#B05A38",
              }}
            />
            Marketing
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 999,
              background: "rgba(59, 130, 246, 0.12)",
              color: "#1e3a8a",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#8A3D63",
              }}
            />
            Sales
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 999,
              background: "rgba(34, 197, 94, 0.12)",
              color: "#14532d",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#15803D",
              }}
            />
            Support
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
