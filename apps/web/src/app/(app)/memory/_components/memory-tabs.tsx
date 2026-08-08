"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitRuleTitle } from "@/lib/rule-title";
import { Monogram } from "@/components/monogram";
import { Tally } from "@/components/tally";
import { ProvenanceTag } from "@/components/provenance-tag";

interface EmployeeRef {
  id: string;
  name: string;
  roleType: string;
}

interface RuleEntry {
  id: string;
  agentId: string;
  ruleType: string;
  taskScope: string[];
  title: string;
  description: string;
  confidence: number;
  corroborationCount: number;
  tasksAppliedTo: number;
  createdAt: string;
}

interface CandidateEntry {
  id: string;
  agentId: string;
  title: string;
  description: string;
  confidence: number;
  distinctReviewCount: number;
  threshold: number;
  isSessionRow: boolean;
  updatedAt: string;
}

interface DeprecatedEntry {
  id: string;
  agentId: string;
  title: string;
  description: string;
  deprecatedAt: string;
  deprecatedReason: string;
}

interface EpisodeEntry {
  id: string;
  agentId: string;
  episodeType: string;
  summary: string;
  occurredAt: string;
  taskId: string | null;
  isConsolidated: boolean;
}

interface FactEntry {
  id: string;
  agentId: string | null;
  fact: string;
  context: string | null;
  category: string;
  confidence: number;
  source: string | null;
  validFrom: string;
}

const TABS = [
  { id: "procedural", label: "Procedural" },
  { id: "episodic", label: "Episodic" },
  { id: "semantic", label: "Semantic" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MemoryTabs({
  demoMode,
  employees,
  rules,
  candidates,
  deprecated,
  episodes,
  facts,
}: {
  demoMode: boolean;
  employees: EmployeeRef[];
  rules: RuleEntry[];
  candidates: CandidateEntry[];
  deprecated: DeprecatedEntry[];
  episodes: EpisodeEntry[];
  facts: FactEntry[];
}) {
  const [tab, setTab] = useState<TabId>("procedural");
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const counts: Record<TabId, number> = {
    procedural: rules.length + candidates.length,
    episodic: episodes.length,
    semantic: facts.length,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Memory</h1>
        <p className="spec mt-1.5 text-ink-muted">
          {rules.length} standing rule{rules.length === 1 ? "" : "s"} · {candidates.length} candidate
          {candidates.length === 1 ? "" : "s"} · {episodes.length} episodes · {facts.length} facts
        </p>
      </header>

      <div role="tablist" aria-label="Memory tiers" className="hairline-b flex gap-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex items-baseline gap-1.5 border-b-2 py-2.5 text-[13.5px] font-semibold transition-colors duration-150",
              tab === t.id
                ? "border-ink text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            <span className="spec text-ink-muted">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-5">
        {tab === "procedural" && (
          <ProceduralTab
            demoMode={demoMode}
            rules={rules}
            candidates={candidates}
            deprecated={deprecated}
            employeeById={employeeById}
          />
        )}
        {tab === "episodic" && <EpisodicTab episodes={episodes} employeeById={employeeById} demoMode={demoMode} />}
        {tab === "semantic" && <SemanticTab facts={facts} demoMode={demoMode} />}
      </div>
    </div>
  );
}

function ProceduralTab({
  demoMode,
  rules,
  candidates,
  deprecated,
  employeeById,
}: {
  demoMode: boolean;
  rules: RuleEntry[];
  candidates: CandidateEntry[];
  deprecated: DeprecatedEntry[];
  employeeById: Map<string, EmployeeRef>;
}) {
  return (
    <div className="space-y-8">
      <section aria-label="Operating manual">
        <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
          <h2 className="text-[15px] font-semibold">Operating manual</h2>
          <span className="spec-label">standing rules, injected into every matching run</span>
        </div>
        {rules.length === 0 ? (
          <p className="mt-2.5 max-w-lg text-[13px] leading-snug text-ink-muted">
            No standing rules yet. Review a deliverable and edit it: the diff becomes a candidate
            below, and corroborated candidates promote into this manual.
          </p>
        ) : (
          <ol className="mt-1">
            {rules.map((r) => {
              const emp = employeeById.get(r.agentId);
              const { number, text } = splitRuleTitle(r.title);
              return (
                <li key={r.id} className="hairline-b flex gap-4 py-3.5 last:border-b-0">
                  <span className="spec w-12 shrink-0 pt-0.5 text-ink">{number ?? "—"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug font-semibold">{text}</p>
                    <p className="mt-1 text-[13px] leading-snug text-ink-secondary">
                      {r.description}
                    </p>
                    <p className="spec mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
                      <span>confidence {r.confidence.toFixed(2)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {r.corroborationCount} corroborating review
                        {r.corroborationCount === 1 ? "" : "s"}
                      </span>
                      <span aria-hidden>·</span>
                      <span>applied to {r.tasksAppliedTo} job{r.tasksAppliedTo === 1 ? "" : "s"}</span>
                      {r.taskScope.length > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span>scope {r.taskScope.join(", ")}</span>
                        </>
                      )}
                      {emp && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{emp.name}</span>
                        </>
                      )}
                      {demoMode && <ProvenanceTag kind="seeded" />}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-label="Candidate amendments">
        <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
          <h2 className="text-[15px] font-semibold">Candidate amendments</h2>
          <span className="spec-label">one review never promotes</span>
        </div>
        {candidates.length === 0 ? (
          <p className="mt-2.5 max-w-lg text-[13px] leading-snug text-ink-muted">
            Edit a deliverable and the diff becomes a candidate rule here. It joins the manual only
            after enough distinct reviews corroborate it.
          </p>
        ) : (
          <ul className="mt-1">
            {candidates.map((c) => {
              const emp = employeeById.get(c.agentId);
              const oneAway = c.distinctReviewCount === c.threshold - 1;
              return (
                <li key={c.id} className="hairline-b py-3.5 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-[14px] leading-snug font-semibold">{c.title}</p>
                    {c.isSessionRow ? (
                      <ProvenanceTag kind="live" className="shrink-0" />
                    ) : (
                      demoMode && <ProvenanceTag kind="seeded" className="shrink-0" />
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink-secondary">{c.description}</p>
                  <p className="spec mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
                    <Tally count={c.distinctReviewCount} threshold={c.threshold} />
                    <span>
                      {c.distinctReviewCount} of {c.threshold} reviews
                    </span>
                    <span aria-hidden>·</span>
                    <span>confidence {c.confidence.toFixed(2)}</span>
                    {emp && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{emp.name}</span>
                      </>
                    )}
                  </p>
                  {oneAway && (
                    <p className="spec mt-1 text-identity-deep">
                      one more corroborating review promotes this
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {deprecated.length > 0 && (
        <section aria-label="Deprecated rules">
          <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
            <h2 className="text-[15px] font-semibold">Deprecated</h2>
            <span className="spec-label">rolled back when a rule starts hurting approvals</span>
          </div>
          <ul className="mt-1">
            {deprecated.map((r) => {
              const emp = employeeById.get(r.agentId);
              const { number, text } = splitRuleTitle(r.title);
              return (
                <li key={r.id} className="hairline-b flex gap-4 py-3.5 last:border-b-0">
                  <span className="spec w-12 shrink-0 pt-0.5 text-ink-muted line-through">
                    {number ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug font-semibold text-ink-secondary">
                      {text}
                    </p>
                    <p className="mt-1 text-[13px] leading-snug text-ink-muted">{r.description}</p>
                    <p className="spec mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-state-failed">{r.deprecatedReason}</span>
                      <span aria-hidden className="text-ink-muted">·</span>
                      <span className="text-ink-muted">{fmtDate(r.deprecatedAt)}</span>
                      {emp && (
                        <>
                          <span aria-hidden className="text-ink-muted">·</span>
                          <span className="text-ink-muted">{emp.name}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function EpisodicTab({
  episodes,
  employeeById,
  demoMode,
}: {
  episodes: EpisodeEntry[];
  employeeById: Map<string, EmployeeRef>;
  demoMode: boolean;
}) {
  return (
    <section aria-label="Job outcomes journal">
      <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
        <h2 className="text-[15px] font-semibold">Job outcomes</h2>
        <span className="spec-label">read at planning, retrieved by similarity</span>
      </div>
      {episodes.length === 0 ? (
        <p className="mt-2.5 max-w-lg text-[13px] leading-snug text-ink-muted">
          Nothing on file yet. Every finished job writes what happened here, and consolidation
          distills repeated outcomes into standing rules.
        </p>
      ) : (
        <ol className="mt-1">
          {episodes.map((e) => {
            const emp = employeeById.get(e.agentId);
            return (
              <li key={e.id} className="hairline-b flex items-start gap-3 py-3 last:border-b-0">
                <span className="spec w-12 shrink-0 pt-1 text-ink-muted">
                  {fmtDate(e.occurredAt)}
                </span>
                <Monogram name={emp?.name ?? "?"} roleType={emp?.roleType} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug">{e.summary}</p>
                  <p className="spec-label mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{e.episodeType.replace(/_/g, " ")}</span>
                    {e.isConsolidated && <span className="text-ink">consolidated into a rule</span>}
                    {demoMode && <ProvenanceTag kind="seeded" />}
                    {e.taskId && (
                      <Link
                        href={`/dashboard/tasks/${e.taskId}`}
                        className="inline-flex items-center gap-0.5 text-ink transition-colors hover:text-identity-deep"
                      >
                        job ticket
                        <ArrowUpRight size={11} strokeWidth={1.5} />
                      </Link>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function SemanticTab({ facts, demoMode }: { facts: FactEntry[]; demoMode: boolean }) {
  return (
    <section aria-label="Fact ledger">
      <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
        <h2 className="text-[15px] font-semibold">Fact ledger</h2>
        <span className="spec-label">read at retrieval, embedded in pgvector</span>
      </div>
      {facts.length === 0 ? (
        <p className="mt-2.5 max-w-lg text-[13px] leading-snug text-ink-muted">
          No facts yet. What the company learns while working, pricing, competitors, its own
          calendar, lands in this ledger and is retrieved by similarity at task time.
        </p>
      ) : (
        <ul className="mt-1">
          {facts.map((f) => (
            <li key={f.id} className="hairline-b flex items-start gap-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-snug">{f.fact}</p>
                {f.context && (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">{f.context}</p>
                )}
                <p className="spec-label mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{f.category.replace(/_/g, " ")}</span>
                  {f.source && <span>via {f.source.replace(/_/g, " ")}</span>}
                  {demoMode && <ProvenanceTag kind="seeded" />}
                </p>
              </div>
              <div className="spec shrink-0 pt-0.5 text-right text-ink-muted">
                <span className="block">{f.confidence.toFixed(2)}</span>
                <span className="block">{fmtDate(f.validFrom)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
