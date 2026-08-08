"use client";

import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  company_overview: "Company overview",
  products: "Products & services",
  audience: "Target audience",
  brand_voice: "Brand voice",
  competitors: "Competitors",
  team: "Team",
  processes: "Processes",
  historical: "Historical outputs",
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

export function KnowledgeSidebar({
  contextScore,
  categories,
  totalItems,
  onRevisitCategory,
}: KnowledgeSidebarProps) {
  const filledCount = categories.filter((c) => c.filled).length;

  return (
    <aside className="hidden h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-hairline bg-bg px-5 py-4 lg:flex">
      <p className="spec-label">Company file</p>

      <div className="rule-t mt-2 pt-3">
        <p className="flex items-baseline gap-1.5">
          <span className="display text-3xl tnum">{contextScore}</span>
          <span className="spec text-ink-muted">/100 context</span>
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-secondary">
          Filed answers become the knowledge every run reads. 40 is enough to continue.
        </p>
      </div>

      <div className="mt-5">
        <p className="spec-label hairline-b pb-1.5">
          Categories · {filledCount}/{categories.length}
        </p>
        <ul>
          {categories.map((cat) => {
            const label = CATEGORY_LABELS[cat.name] ?? cat.name;
            const clickable = cat.filled && !!onRevisitCategory;
            const inner = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "h-2 w-2 shrink-0",
                    cat.filled ? "bg-ink" : "border border-hairline",
                  )}
                />
                <span
                  className={cn(
                    "flex-1 text-[12.5px] leading-tight",
                    cat.filled ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {label}
                </span>
                <span className="spec-label">{cat.filled ? (clickable ? "amend" : "filed") : "open"}</span>
              </>
            );
            return (
              <li key={cat.name} className="hairline-b last:border-b-0">
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onRevisitCategory(cat.name)}
                    aria-label={`Amend ${label}`}
                    className="flex w-full items-center gap-2.5 py-2 text-left transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5 py-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="spec mt-auto pt-5 text-ink-muted">{totalItems} items on file</p>
    </aside>
  );
}
