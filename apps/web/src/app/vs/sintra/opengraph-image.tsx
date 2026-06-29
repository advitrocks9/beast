import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Beast vs Sintra - One AI marketing manager, not twelve helpers";
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
          <div style={{ flex: 1 }} />
          <div
            style={{
              fontSize: 18,
              color: "#525252",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Comparison
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 80,
              fontWeight: 800,
              color: "#0a0a0a",
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
            }}
          >
            Beast vs Sintra
          </div>
          <div
            style={{
              fontSize: 32,
              color: "#525252",
              maxWidth: 1000,
              lineHeight: 1.35,
            }}
          >
            One AI marketing manager that remembers, cites, and finishes work. Not twelve overlapping helpers you need to coordinate.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            style={{
              padding: "14px 24px",
              borderRadius: 12,
              background: "#0a0a0a",
              color: "white",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Memory + Source grounding + One manager
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#525252",
              fontWeight: 500,
            }}
          >
            With citations.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
