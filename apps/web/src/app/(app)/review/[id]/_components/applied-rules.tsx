export interface AppliedRule {
  ruleId: string;
  summary: string;
  evidence: string;
  extractedFromDeliverableId: string;
  extractedFromTitle: string;
  extractedAt: string;
  confidence: number;
}

interface AppliedRulesProps {
  rules: AppliedRule[] | undefined;
  ruleNumbers: Record<string, string>;
}

export function AppliedRules({ rules, ruleNumbers }: AppliedRulesProps) {
  if (!rules || rules.length === 0) return null;

  const sorted = [...rules].sort((a, b) => b.confidence - a.confidence);

  return (
    <section aria-label="Rules loaded into context" className="panel-tinted p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-semibold">Loaded into context</h2>
        <p className="spec-label">
          {sorted.length} standing rule{sorted.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="mt-2">
        {sorted.map((rule) => {
          const num = ruleNumbers[rule.ruleId];
          return (
            <li
              key={rule.ruleId}
              title={rule.extractedFromTitle ? `Born in "${rule.extractedFromTitle}"` : undefined}
              className="hairline-t grid grid-cols-[44px_1fr_auto] gap-x-2 py-2 first:border-t-0 first:pt-0"
            >
              <span className="spec font-semibold text-ink">{num ?? "rule"}</span>
              <span className="min-w-0 text-[13px] leading-snug font-medium">{rule.summary}</span>
              <span className="spec text-ink-muted">{rule.confidence.toFixed(2)}</span>
              {rule.evidence && (
                <p className="spec col-start-2 mt-0.5 min-w-0 text-ink-secondary">
                  {rule.evidence}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
