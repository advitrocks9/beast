"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

const RULE_TYPE_LABEL: Record<string, string> = {
  style_rule: "Always do",
  avoid_pattern: "Never do",
  approved_example: "Reference example",
};

const RULE_TYPE_COLOR: Record<string, string> = {
  style_rule: "#22C55E",
  avoid_pattern: "#DC2626",
  approved_example: "#3B82F6",
};

export default function SettingsRulesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const employees = useQuery(trpc.employees.list.queryOptions());

  const selected = employeeId ?? employees.data?.[0]?.id ?? null;

  const rules = useQuery({
    ...trpc.memory.listAllRules.queryOptions({ employeeId: selected ?? "" }),
    enabled: !!selected,
  });

  const deprecated = useQuery({
    ...trpc.memory.listDeprecatedRules.queryOptions({ employeeId: selected ?? "" }),
    enabled: !!selected,
  });

  const invalidateRulesAndDeprecated = () => {
    if (!selected) return;
    queryClient.invalidateQueries({
      queryKey: trpc.memory.listAllRules.queryOptions({ employeeId: selected }).queryKey,
    });
    queryClient.invalidateQueries({
      queryKey: trpc.memory.listDeprecatedRules.queryOptions({ employeeId: selected }).queryKey,
    });
  };

  const deactivate = useMutation({
    ...trpc.memory.deactivateRule.mutationOptions(),
    onSuccess: invalidateRulesAndDeprecated,
  });

  const restore = useMutation({
    ...trpc.memory.restoreRule.mutationOptions(),
    onSuccess: invalidateRulesAndDeprecated,
  });

  const employeesData = employees.data ?? [];

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="heading-gradient text-lg font-semibold">Rules</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Tell each employee what to always do or never do. Manual rules land at high signal weight, so they apply immediately to the next task.
            </p>
          </div>
        </div>

        {employeesData.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {employeesData.map((emp) => {
              const active = (selected ?? employeesData[0]?.id) === emp.id;
              const hex = ROLE_COLORS[emp.roleType ?? ""] ?? "#9CA3AF";
              return (
                <button
                  key={emp.id}
                  onClick={() => setEmployeeId(emp.id)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-white"
                      : "bg-transparent text-text-secondary hover:bg-[oklch(0.97_0.005_260/0.5)]"
                  }`}
                  style={{
                    borderColor: active ? hex : "oklch(0.85_0.01_260/0.4)",
                    color: active ? hex : undefined,
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: hex }}
                  />
                  {emp.name}
                </button>
              );
            })}
          </div>
        )}

        {selected && <CreateRuleForm employeeId={selected} />}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Current rules</h3>
        {!selected && (
          <p className="text-xs text-text-muted">Pick an employee to see and edit rules.</p>
        )}
        {selected && rules.isLoading && (
          <p className="text-xs text-text-muted">Loading...</p>
        )}
        {selected && rules.data && rules.data.length === 0 && (
          <GlassCard hoverable={false} className="p-5">
            <p className="text-sm text-text-muted">
              No rules yet. The first manual rule you write applies on the next task this employee runs.
            </p>
          </GlassCard>
        )}
        {selected && rules.data && rules.data.length > 0 && (
          <RuleGroups
            rules={rules.data}
            onDeactivate={(ruleId, title) => {
              if (confirm(`Deactivate "${title}"? Append-only history is preserved.`)) {
                deactivate.mutate({ ruleId });
              }
            }}
            deactivatePending={deactivate.isPending}
          />
        )}
      </section>

      {selected && deprecated.data && deprecated.data.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Recently deprecated (7d)</h3>
          <p className="text-xs text-text-muted mb-2">
            Rules removed in the last week. Auto-rollbacks fire when a rule&rsquo;s
            14d approval rate drops 10pp or more. Restore brings the rule back
            with a fresh trend window.
          </p>
          <DeprecatedRules
            rules={deprecated.data}
            onRestore={(ruleId, title) => {
              if (confirm(`Restore "${title}"? It will apply to the next task.`)) {
                restore.mutate({ ruleId });
              }
            }}
            restorePending={restore.isPending}
          />
        </section>
      )}
    </div>
  );
}

type RuleRow = {
  id: string;
  ruleType: string;
  title: string;
  description: string;
  taskScope: string[] | null;
  signalWeight: number | null;
  tasksAppliedTo: number;
  approvalRateDelta: number | null;
  version: number;
};

function trendBadge(delta: number | null): { label: string; color: string; bg: string } | null {
  if (delta === null) return null;
  const pct = Math.round(delta * 100);
  if (pct === 0) return null;
  if (pct >= 5) return { label: `+${pct}% approval`, color: "#15803D", bg: "#DCFCE7" };
  if (pct <= -10) return { label: `${pct}% approval`, color: "#B91C1C", bg: "#FEE2E2" };
  if (pct < 0) return { label: `${pct}% approval`, color: "#B45309", bg: "#FEF3C7" };
  return { label: `+${pct}% approval`, color: "#1D4ED8", bg: "#DBEAFE" };
}

const GROUP_ORDER: Array<"style_rule" | "avoid_pattern" | "approved_example"> = [
  "style_rule",
  "avoid_pattern",
  "approved_example",
];

function RuleGroups({
  rules,
  onDeactivate,
  deactivatePending,
}: {
  rules: RuleRow[];
  onDeactivate: (ruleId: string, title: string) => void;
  deactivatePending: boolean;
}) {
  const grouped = new Map<string, RuleRow[]>();
  for (const r of rules) {
    const list = grouped.get(r.ruleType) ?? [];
    list.push(r);
    grouped.set(r.ruleType, list);
  }

  return (
    <div className="space-y-5">
      {GROUP_ORDER.map((type) => {
        const list = grouped.get(type);
        if (!list || list.length === 0) return null;
        const color = RULE_TYPE_COLOR[type]!;
        const label = RULE_TYPE_LABEL[type]!;
        return (
          <div key={type}>
            <div className="mb-2 flex items-baseline gap-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color }}
              >
                {label}
              </span>
              <span className="text-[11px] text-text-muted">
                {list.length} {list.length === 1 ? "rule" : "rules"}
              </span>
            </div>
            <div className="space-y-2">
              {list.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onDeactivate={onDeactivate}
                  deactivatePending={deactivatePending}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RuleCard({
  rule,
  onDeactivate,
  deactivatePending,
}: {
  rule: RuleRow;
  onDeactivate: (ruleId: string, title: string) => void;
  deactivatePending: boolean;
}) {
  const color = RULE_TYPE_COLOR[rule.ruleType] ?? "#9CA3AF";
  const trend = trendBadge(rule.approvalRateDelta);
  return (
    <GlassCard hoverable={false} className="p-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{rule.title}</p>
            {trend && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: trend.bg, color: trend.color }}
                title="14d approval-rate delta vs prior 14d"
              >
                {trend.label}
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-1">{rule.description}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
            {rule.taskScope && rule.taskScope.length > 0 && (
              <span>scope: {rule.taskScope.join(", ")}</span>
            )}
            <span>weight: {(rule.signalWeight ?? 0).toFixed(1)}</span>
            <span>used: {rule.tasksAppliedTo}x</span>
            <span>v{rule.version}</span>
          </div>
        </div>
        <button
          onClick={() => onDeactivate(rule.id, rule.title)}
          disabled={deactivatePending}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[oklch(0.97_0.05_25)] hover:text-error shrink-0"
          aria-label={`Deactivate ${rule.title}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </GlassCard>
  );
}

type DeprecatedRow = {
  id: string;
  ruleType: string;
  title: string;
  description: string;
  taskScope: string[] | null;
  deprecatedAt: Date | string | null;
  deprecatedReason: string | null;
  version: number;
};

function relativeFromNow(value: Date | string | null): string {
  if (!value) return "recently";
  const date = value instanceof Date ? value : new Date(value);
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function deprecatedReasonCopy(raw: string | null): string {
  if (!raw) return "Deprecated.";
  if (raw === "founder_deactivated") return "Deactivated by you.";
  return raw;
}

function DeprecatedRules({
  rules,
  onRestore,
  restorePending,
}: {
  rules: DeprecatedRow[];
  onRestore: (ruleId: string, title: string) => void;
  restorePending: boolean;
}) {
  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const color = RULE_TYPE_COLOR[rule.ruleType] ?? "#9CA3AF";
        const label = RULE_TYPE_LABEL[rule.ruleType] ?? rule.ruleType;
        return (
          <GlassCard key={rule.id} hoverable={false} className="p-4 opacity-90">
            <div className="flex items-start gap-3">
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium line-through text-text-secondary">
                    {rule.title}
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {relativeFromNow(rule.deprecatedAt)}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1">{rule.description}</p>
                <p className="mt-2 text-[11px] text-text-muted">
                  {deprecatedReasonCopy(rule.deprecatedReason)}
                </p>
              </div>
              <button
                onClick={() => onRestore(rule.id, rule.title)}
                disabled={restorePending}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50 shrink-0"
              >
                <RotateCcw size={12} />
                Restore
              </button>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

function CreateRuleForm({ employeeId }: { employeeId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ruleType, setRuleType] = useState<"style_rule" | "avoid_pattern" | "approved_example">("style_rule");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scopeText, setScopeText] = useState("");

  const create = useMutation({
    ...trpc.memory.createManualRule.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.memory.listAllRules.queryOptions({ employeeId }).queryKey,
      });
      setTitle("");
      setDescription("");
      setScopeText("");
      setOpen(false);
    },
  });

  function handleSave() {
    if (title.trim().length < 3 || description.trim().length < 3) return;
    const taskScope = scopeText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    create.mutate({
      employeeId,
      ruleType,
      title: title.trim(),
      description: description.trim(),
      taskScope,
      goodExamples: [],
      badExamples: [],
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-[oklch(0.8_0.01_260/0.4)] bg-white px-4 py-2.5 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent"
      >
        <Plus size={14} />
        Add rule
      </button>
    );
  }

  return (
    <GlassCard hoverable={false} className="p-5 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {(["style_rule", "avoid_pattern", "approved_example"] as const).map((t) => {
          const active = ruleType === t;
          const color = RULE_TYPE_COLOR[t]!;
          return (
            <button
              key={t}
              onClick={() => setRuleType(t)}
              className="rounded-xl border px-3 py-2 text-xs font-medium transition-colors"
              style={{
                borderColor: active ? color : "oklch(0.85_0.01_260/0.4)",
                backgroundColor: active ? `${color}10` : "white",
                color: active ? color : "var(--color-text-secondary)",
              }}
            >
              {RULE_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Open every tweet with a specific number"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Explain when and why. The agent reads this verbatim."
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Task scope <span className="font-normal text-text-muted">(optional, comma-separated)</span>
        </label>
        <input
          value={scopeText}
          onChange={(e) => setScopeText(e.target.value)}
          placeholder="e.g. social_post, blog_post"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={() => setOpen(false)}
          disabled={create.isPending}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={create.isPending || title.trim().length < 3 || description.trim().length < 3}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {create.isPending ? "Saving..." : "Save rule"}
        </button>
      </div>

      {create.error && (
        <p className="text-xs text-error">{create.error.message}</p>
      )}
    </GlassCard>
  );
}
