"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

const CATEGORY_LABEL: Record<string, string> = {
  core: "Core",
  tool: "Agent tools",
  outbound: "Outbound channels",
};

const CATEGORY_ORDER = ["core", "tool", "outbound"] as const;

export function ExternalServicesSection() {
  const trpc = useTRPC();
  const integrations = useQuery(trpc.system.integrations.queryOptions());
  const items = integrations.data ?? [];

  if (integrations.isLoading) {
    return (
      <GlassCard hoverable={false} className="p-4">
        <p className="text-xs text-text-muted">Reading service config...</p>
      </GlassCard>
    );
  }

  // Group by category, preserve the canonical order
  const byCategory = new Map<string, typeof items>();
  for (const item of items) {
    const cat = item.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const missingCount = items.filter((i) => !i.configured).length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">External services</h2>
        {missingCount > 0 && (
          <span className="text-[11px] text-text-muted">
            {missingCount} unconfigured
          </span>
        )}
      </div>
      <p className="text-xs text-text-muted">
        Env-driven keys read at request time. A green pill means the
        worker can reach the service; an amber pill means the codepath
        is wired but the key is missing.
      </p>
      {CATEGORY_ORDER.map((cat) => {
        const rows = byCategory.get(cat) ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {CATEGORY_LABEL[cat] ?? cat}
            </p>
            {rows.map((r) => (
              <GlassCard key={r.key} hoverable={false} className="p-3">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: r.configured ? "#22C55E" : "#F59E0B" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{r.label}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: r.configured ? "#DCFCE7" : "#FEF3C7",
                          color: r.configured ? "#15803D" : "#B45309",
                        }}
                      >
                        {r.configured ? "Configured" : "Not configured"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{r.notes}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
                      <span>{r.envKeys.length === 1 ? "Env var:" : "Env vars:"}</span>
                      {r.envKeys.map((k) => (
                        <code
                          key={k}
                          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
                        >
                          {k}
                        </code>
                      ))}
                    </p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        );
      })}
    </div>
  );
}
