"use client";

import { GlassPanel } from "@beast/ui";

import { BRAND, BRAND_DEEP, statusMeta } from "@/lib/colors";

const CATEGORY_LABELS: Record<string, string> = {
  company_overview: "Company Overview",
  products: "Products & Services",
  audience: "Target Audience",
  brand_voice: "Brand Voice",
  competitors: "Competitors",
  team: "Team",
  processes: "Processes",
};

interface CategoryProgress {
  name: string;
  filled: boolean;
}

interface KnowledgeSidebarProps {
  contextScore: number;
  categories: CategoryProgress[];
  totalItems: number;
  onRevisitCategory?: (category: string) => void;
}

function ContextScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-32 w-32">
        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
          {/* Background ring */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="oklch(0.9 0.005 260 / 0.4)"
            strokeWidth="8"
          />
          {/* Progress ring */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="url(#scoreGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={BRAND} />
              <stop offset="100%" stopColor={BRAND_DEEP} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-(--font-display) text-3xl font-bold tracking-tight">
            {score}
          </span>
          <span className="text-xs text-text-secondary">/ 100</span>
        </div>
      </div>
      <p className="text-sm font-medium text-text-secondary">Context Score</p>
    </div>
  );
}

export function KnowledgeSidebar({ contextScore, categories, totalItems, onRevisitCategory }: KnowledgeSidebarProps) {
  const filledCount = categories.filter((c) => c.filled).length;
  const done = statusMeta("completed");

  return (
    <GlassPanel variant="sidebar" className="flex h-full w-80 flex-col p-6">
      <h2 className="heading-gradient text-lg font-semibold mb-6">Knowledge Base</h2>

      <ContextScoreRing score={contextScore} />

      <div className="mt-6 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Categories ({filledCount}/{categories.length})
        </p>
        <div className="space-y-1.5">
          {categories.map((cat) => {
            const clickable = cat.filled && !!onRevisitCategory;
            const inner = (
              <>
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-xs transition-colors"
                  style={{
                    backgroundColor: cat.filled ? done.fg : "oklch(0.85 0.01 260 / 0.4)",
                    color: cat.filled ? "white" : "oklch(0.5 0.01 260)",
                  }}
                >
                  {cat.filled ? "✓" : "·"}
                </div>
                <span className={cat.filled ? "text-text" : "text-text-secondary"}>
                  {CATEGORY_LABELS[cat.name] ?? cat.name}
                </span>
                {clickable && (
                  <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Edit
                  </span>
                )}
              </>
            );
            const styleProps = {
              backgroundColor: cat.filled
                ? done.bg
                : "oklch(0.97 0.005 260 / 0.3)",
            };
            if (clickable) {
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => onRevisitCategory!(cat.name)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:brightness-95"
                  style={styleProps}
                  aria-label={`Revisit ${CATEGORY_LABELS[cat.name] ?? cat.name}`}
                >
                  {inner}
                </button>
              );
            }
            return (
              <div
                key={cat.name}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
                style={styleProps}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <div className="rounded-lg bg-brand-light/50 p-3 text-center">
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-brand">{totalItems}</span> knowledge items collected
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}
