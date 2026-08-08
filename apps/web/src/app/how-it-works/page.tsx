import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The loop: brief, bounded agent run, review, and confidence-gated learning. One page.",
};

const STATIONS = [
  {
    n: "01",
    name: "Intake",
    state: "queued",
    body: "A job is briefed: title, deliverable spec, the employee it goes to.",
  },
  {
    n: "02",
    name: "Dispatch",
    state: "queued",
    body: "Commissioned jobs dispatch immediately; the orchestrator sweeps up anything left behind.",
  },
  {
    n: "03",
    name: "Execution",
    state: "running",
    body: "A bounded tool loop: at most 50 steps and a hard wall clock. Standing rules are injected before the first step; similar past jobs are retrieved.",
  },
  {
    n: "04",
    name: "Filing",
    state: "in_review",
    body: "The deliverable lands in the review tray with its full trajectory attached: every tool call, source, and rule that shaped it.",
  },
  {
    n: "05",
    name: "Review",
    state: "accepted",
    body: "You accept, edit, or reject. The interface is delegation and review, not prompting.",
  },
  {
    n: "06",
    name: "Learning",
    state: "revised",
    body: "Your edit is diffed word by word and distilled into a candidate rule with a confidence score.",
  },
  {
    n: "07",
    name: "Promotion",
    state: "published",
    body: "Candidates accumulate corroboration across reviews. Only past the threshold do they become standing rules that gate future runs. One review never promotes.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 lg:h-screen lg:overflow-hidden">
      <header className="rule-b flex items-end justify-between pb-3">
        <div>
          <Link
            href="/dashboard"
            className="spec-label inline-flex items-center gap-1.5 transition-colors hover:text-ink"
          >
            <ArrowLeft size={12} strokeWidth={1.5} />
            Back to the office
          </Link>
          <h1 className="display mt-2 text-3xl lg:text-4xl">How the company works</h1>
        </div>
        <p className="spec-label hidden text-right sm:block">
          Beast operating manual
          <br />
          One page.
        </p>
      </header>

      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-secondary">
        Beast is an autonomous AI company. You brief it, agent employees do the work in bounded
        tool loops, deliverables land in your review queue, and your edits become the company&apos;s
        standing operating rules. Every review makes the company permanently better; no single
        review can make it worse.
      </p>

      <section aria-label="The loop" className="mt-6">
        <div className="grid grid-cols-1 gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-7">
          {STATIONS.map((s) => (
            <div key={s.n} className="flex flex-col gap-2 bg-bg p-3.5">
              <div className="flex items-center justify-between">
                <span className="spec text-ink-muted">{s.n}</span>
                <span className="spec-label">{s.state}</span>
              </div>
              <h2 className="text-[15px] leading-tight font-semibold">{s.name}</h2>
              <p className="text-[12.5px] leading-snug text-ink-secondary">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rule-t pt-3">
          <h2 className="text-base font-semibold">Three memory tiers</h2>
          <dl className="mt-2.5 space-y-2.5 text-[13px] leading-snug">
            <div>
              <dt className="font-semibold">
                Episodic <span className="spec-label ml-1">read at planning</span>
              </dt>
              <dd className="text-ink-secondary">
                What happened on past jobs: trajectories and outcomes, retrieved by similarity.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">
                Semantic <span className="spec-label ml-1">read at retrieval</span>
              </dt>
              <dd className="text-ink-secondary">
                Facts the company has learned, embedded in pgvector.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">
                Procedural <span className="spec-label ml-1">injected into context</span>
              </dt>
              <dd className="text-ink-secondary">
                The operating manual: numbered standing rules, applied to every matching run.
              </dd>
            </div>
          </dl>
        </div>

        <div className="rule-t pt-3">
          <h2 className="text-base font-semibold">The confidence gate</h2>
          <p className="mt-2.5 text-[13px] leading-snug text-ink-secondary">
            Every review signal lands on a candidate rule, never directly on the manual. Confidence
            is <span className="spec">1 − e^(−w/2)</span> over accumulated signal weight, and
            promotion needs both enough distinct corroborating reviews and confidence ≥ 0.6.
          </p>
          <p className="mt-2 text-[13px] leading-snug text-ink-secondary">
            This is the load-bearing design decision: one bad review cannot poison the company,
            and a rule that starts hurting approval rates is rolled back by drift detection.
          </p>
        </div>

        <div className="rule-t pt-3">
          <h2 className="text-base font-semibold">Provenance, always</h2>
          <p className="mt-2.5 text-[13px] leading-snug text-ink-secondary">
            Everything in the demo is labelled with what it is:
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-secondary">
            <li>
              <span className="spec-label mr-1.5 border border-hairline px-1.5 py-0.5">Seeded</span>
              part of the demo company&apos;s history
            </li>
            <li>
              <span className="spec-label mr-1.5 border border-hairline px-1.5 py-0.5">Replay</span>
              a recorded run, replayed at natural pace
            </li>
            <li>
              <span className="spec-label mr-1.5 border border-hairline px-1.5 py-0.5">Live</span>
              running against a real model right now
            </li>
            <li>
              <span className="spec-label mr-1.5 border border-hairline px-1.5 py-0.5">
                Simulated
              </span>
              the deterministic fixture provider, used when budgets are spent
            </li>
          </ul>
          <p className="mt-2 text-[13px] leading-snug text-ink-secondary">
            Live runs are capped per visitor and per day. When the budget is gone the demo says so
            and offers a replay; it never swaps one for the other silently.
          </p>
        </div>
      </section>

      <footer className="rule-t mt-6 flex flex-wrap items-center justify-between gap-2 py-3">
        <p className="spec-label">
          Next.js · tRPC · Postgres + pgvector · Trigger.dev · provider-agnostic agent runtime
        </p>
        <a
          href="https://github.com/advitrocks9/beast"
          target="_blank"
          rel="noreferrer"
          className="text-[13px] font-semibold text-ink underline underline-offset-2"
        >
          Read the source
        </a>
      </footer>
    </main>
  );
}
