import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Beast pricing - $99/mo flat for one AI employee";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TIERS = [
  {
    name: "Starter",
    price: "$99",
    tagline: "One AI employee",
    accent: "#B05A38",
  },
  {
    name: "Team",
    price: "$299",
    tagline: "Two AI employees",
    accent: "#8A3D63",
    emphasis: true,
  },
  {
    name: "Business",
    price: "$499",
    tagline: "All three",
    accent: "#15803D",
  },
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
          padding: "72px",
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
            Pricing
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 64,
            fontWeight: 800,
            color: "#0a0a0a",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          $99/mo flat.
          <br />
          No credits.
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 24,
            color: "#525252",
            maxWidth: 900,
          }}
        >
          One price per AI employee. No per-task fees, no surprise bills.
        </div>

        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 18,
          }}
        >
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: "22px 24px",
                borderRadius: 16,
                background: tier.emphasis
                  ? "rgba(10, 10, 10, 0.95)"
                  : "rgba(255, 255, 255, 0.7)",
                color: tier.emphasis ? "white" : "#0a0a0a",
                border: tier.emphasis
                  ? "1px solid rgba(10, 10, 10, 1)"
                  : "1px solid rgba(10, 10, 10, 0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  color: tier.emphasis ? "rgba(255, 255, 255, 0.7)" : "#525252",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: tier.accent,
                  }}
                />
                {tier.name}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 44,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                {tier.price}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 16,
                  color: tier.emphasis ? "rgba(255, 255, 255, 0.65)" : "#525252",
                }}
              >
                {tier.tagline}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
