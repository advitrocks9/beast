"use client";

import { motion, useReducedMotion } from "motion/react";
import { RegisterMark } from "@/components/state-chip";
import { CountUp } from "@/components/motion/count-up";

const EASE = [0.16, 1, 0.3, 1] as const;

const TRAIL = [
  { t: "12:04:11", step: "web_search", detail: "“stumptown subscription tiers pricing” → 6 results" },
  { t: "12:04:19", step: "fetch_page", detail: "stumptown.com/subscriptions → tier table extracted" },
  { t: "12:04:31", step: "rule_check", detail: "R-002 price comparisons include shipping → applied" },
  { t: "12:04:47", step: "compose", detail: "teardown drafted, 2 sources cited" },
];

const RULES = [
  { id: "R-002", text: "Price comparisons always include shipping.", n: 3, conf: 0.81 },
  { id: "R-003", text: "Support replies sign off “Maya + the Northwind crew”.", n: 4, conf: 0.88 },
  { id: "R-007", text: "No exclamation marks in outreach subject lines.", n: 3, conf: 0.76 },
];

export function LandingSpecimen() {
  const reduced = useReducedMotion();
  const line = (i: number) => ({
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: EASE, delay: 0.7 + i * 0.55 },
  });

  return (
    <div aria-label="Specimen: a job moving through the loop" className="flex min-w-0 flex-col gap-3">
      <motion.div
        className="panel p-4"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
      >
        <div className="hairline-b flex items-center justify-between pb-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] bg-emp-alex font-mono text-[10px] uppercase text-white">
              Al
            </span>
            <span className="truncate text-[13.5px] font-semibold">
              Teardown: Stumptown subscription tiers
            </span>
          </div>
          <span className="chip shrink-0 bg-identity-deep text-white">
            <RegisterMark size={10} />
            Running
          </span>
        </div>
        <ol className="spec mt-2.5 space-y-1.5 text-[11px] text-ink-secondary">
          {TRAIL.map((row, i) => (
            <motion.li key={row.t} className="flex gap-3" {...line(i)}>
              <span className="shrink-0 text-ink-muted">{row.t}</span>
              <span className="min-w-[72px] shrink-0 font-semibold text-ink">{row.step}</span>
              <span className="min-w-0 flex-1 truncate">{row.detail}</span>
            </motion.li>
          ))}
        </ol>
        <motion.p className="spec-label mt-3" {...line(TRAIL.length)}>
          Specimen · recorded run · 4 of 11 steps shown
        </motion.p>
      </motion.div>

      <motion.div
        className="panel-tinted p-4"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.55 }}
      >
        <p className="spec-label">The operating manual, learned from your edits</p>
        <ul className="mt-2 space-y-2">
          {RULES.map((r) => (
            <li key={r.id} className="flex items-baseline gap-3 text-[13px]">
              <span className="spec shrink-0 text-ink-muted">{r.id}</span>
              <span className="flex-1 leading-snug">{r.text}</span>
              <span className="spec whitespace-nowrap text-ink-muted">
                {r.n}× · <CountUp value={r.conf} decimals={2} durationMs={900} />
              </span>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
