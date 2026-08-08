"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

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

  const byCategory = new Map<string, typeof items>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const missingCount = items.filter((i) => !i.configured).length;

  return (
    <section aria-label="Service keys">
      <div className="rule-t flex items-baseline justify-between pt-2.5">
        <h2 className="text-[15px] font-semibold">Service keys</h2>
        {missingCount > 0 && (
          <span className="spec text-ink-muted">{missingCount} unconfigured</span>
        )}
      </div>
      <p className="mt-1.5 text-[13px] text-ink-secondary">
        Env-driven keys read at request time. A missing key degrades its codepath; nothing errors.
      </p>

      {integrations.isLoading ? (
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-9 bg-panel" />
          <div className="h-9 bg-panel" />
          <div className="h-9 bg-panel" />
        </div>
      ) : (
        CATEGORY_ORDER.map((cat) => {
          const rows = byCategory.get(cat) ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={cat} className="mt-3.5">
              <p className="spec-label hairline-b pb-1.5">{CATEGORY_LABEL[cat]}</p>
              <ul>
                {rows.map((r) => (
                  <li key={r.key} className="hairline-b py-2.5 last:border-b-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[13.5px] leading-tight font-semibold">{r.label}</p>
                      <span
                        className={`spec-label ${
                          r.configured ? "text-state-accepted" : "text-identity-deep"
                        }`}
                      >
                        {r.configured ? "configured" : "missing"}
                      </span>
                      <span className="spec ml-auto shrink-0 text-ink-muted">
                        {r.envKeys.join(" ")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-ink-secondary">
                      {r.notes}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
