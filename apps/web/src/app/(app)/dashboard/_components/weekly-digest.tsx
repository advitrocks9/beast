import Link from "next/link";
import { GlassCard } from "@beast/ui";
import { Sparkles } from "lucide-react";

interface ShippedItem {
  id: string;
  title: string;
  employeeName: string;
  deliverableType: string;
}

interface LatestRule {
  title: string;
  ruleType: string;
}

interface WeeklyDigestProps {
  shippedCount: number;
  shippedItems: ShippedItem[];
  pendingReviewCount: number;
  newRulesCount: number;
  rejectedCount: number;
  latestRule: LatestRule | null;
}

const RULE_TYPE_LABEL: Record<string, string> = {
  style_rule: "always-do",
  avoid_pattern: "never-do",
  approved_example: "reference",
};

export function WeeklyDigest({
  shippedCount,
  shippedItems,
  pendingReviewCount,
  newRulesCount,
  rejectedCount,
  latestRule,
}: WeeklyDigestProps) {
  if (
    shippedCount === 0 &&
    pendingReviewCount === 0 &&
    newRulesCount === 0 &&
    rejectedCount === 0
  ) {
    return null;
  }

  const showRejected = rejectedCount > 0;
  const gridCols = showRejected ? "grid-cols-4" : "grid-cols-3";

  return (
    <GlassCard hoverable={false} className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-light">
          <Sparkles size={16} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">This week</h3>
          <p className="text-xs text-text-secondary">
            What your team did in the last 7 days.
          </p>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${gridCols}`}>
        <Tile
          label="Shipped"
          value={shippedCount}
          href="/reviews?status=approved#history"
        />
        <Tile
          label="Awaiting review"
          value={pendingReviewCount}
          href="/reviews"
          tone={pendingReviewCount > 0 ? "warn" : "neutral"}
        />
        <Tile
          label="New rules"
          value={newRulesCount}
          href="/settings/rules"
        />
        {showRejected && (
          <Tile
            label="Rejected"
            value={rejectedCount}
            href="/reviews?status=rejected#history"
            tone="reject"
          />
        )}
      </div>

      {shippedItems.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-2">
            Top shipped
          </p>
          <ul className="space-y-1.5">
            {shippedItems.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Link
                  href={`/review/${item.id}`}
                  className="flex items-baseline gap-2 hover:underline"
                >
                  <span className="truncate text-sm">{item.title}</span>
                  <span className="text-[11px] text-text-muted shrink-0">
                    by {item.employeeName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {latestRule && (
        <p className="mt-4 text-xs text-text-secondary">
          Latest rule:{" "}
          <Link href="/settings/rules" className="text-text hover:underline">
            &ldquo;{latestRule.title}&rdquo;
          </Link>
          <span className="text-text-muted">
            {" "}
            ({RULE_TYPE_LABEL[latestRule.ruleType] ?? latestRule.ruleType})
          </span>
        </p>
      )}
    </GlassCard>
  );
}

function Tile({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  tone?: "neutral" | "warn" | "reject";
}) {
  const accent =
    tone === "reject" && value > 0
      ? "#DC2626"
      : tone === "warn" && value > 0
        ? "#B45309"
        : "#111827";
  return (
    <Link href={href} className="block">
      <div className="rounded-xl border border-gray-100 bg-white px-3 py-3 transition-colors hover:bg-gray-50">
        <p
          className="font-(--font-display) text-2xl font-bold tracking-tight"
          style={{ color: accent }}
        >
          {value}
        </p>
        <p className="mt-0.5 text-[11px] text-text-secondary">{label}</p>
      </div>
    </Link>
  );
}
