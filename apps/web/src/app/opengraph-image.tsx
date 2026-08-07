import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Beast - an autonomous AI company you manage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RULES = [
  { id: "R-002", text: "Price comparisons always include shipping." },
  { id: "R-003", text: "Support replies sign off “Maya + the crew”." },
  { id: "R-007", text: "No exclamation marks in subject lines." },
];

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
          padding: "72px 80px",
          background: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderBottom: "3px solid #131311",
            paddingBottom: 20,
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 2, color: "#131311" }}>
            BEAST
          </div>
          <div style={{ fontSize: 20, color: "#6E6D68" }}>OPERATING MANUAL · LIVE DEMO</div>
        </div>

        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            color: "#131311",
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>An autonomous AI company</span>
          <span style={{ color: "#E8420C" }}>you manage.</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {RULES.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                gap: 20,
                fontSize: 26,
                color: "#4A4A46",
                borderTop: "1px solid #DAD9D4",
                paddingTop: 12,
              }}
            >
              <span style={{ color: "#6E6D68", fontWeight: 600 }}>{r.id}</span>
              <span>{r.text}</span>
              <span style={{ marginLeft: "auto", color: "#6E6D68" }}>learned from review</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
