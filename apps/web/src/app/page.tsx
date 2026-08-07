import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies } from "@beast/db";
import { RegisterMark } from "@/components/state-chip";
import { DEMO_MODE } from "@/lib/demo";

export const metadata = {
  title: "Beast - an autonomous AI company you manage",
  description:
    "Brief it, agent employees run bounded tool loops, deliverables land in your review queue, and your edits become the company's standing operating rules.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Beast - an autonomous AI company you manage",
    description:
      "Agent employees run briefs in bounded tool loops. You review; the company learns your standards permanently.",
    url: "/",
  },
  twitter: {
    title: "Beast - an autonomous AI company you manage",
    description:
      "Agent employees run briefs in bounded tool loops. You review; the company learns your standards permanently.",
  },
};

const TRAIL = [
  { t: "12:04:11", step: "web_search", detail: "“stumptown subscription tiers pricing” → 6 results" },
  { t: "12:04:19", step: "fetch_page", detail: "stumptown.com/subscriptions → tier table extracted" },
  { t: "12:04:31", step: "rule_check", detail: "R-002 price comparisons include shipping → applied" },
  { t: "12:04:47", step: "compose", detail: "teardown drafted, 2 sources cited" },
];

const RULES = [
  { id: "R-002", text: "Price comparisons always include shipping.", n: 3, conf: "0.81" },
  { id: "R-003", text: "Support replies sign off “Maya + the Northwind crew”.", n: 4, conf: "0.88" },
  { id: "R-007", text: "No exclamation marks in outreach subject lines.", n: 3, conf: "0.76" },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const company = await db.query.companies.findFirst({
      where: eq(companies.userId, user.id),
      columns: { onboardingStatus: true },
    });
    if (!company || company.onboardingStatus !== "complete") {
      redirect("/onboarding");
    }
    redirect("/dashboard");
  }

  const appHref = DEMO_MODE ? "/dashboard" : "/sign-up";

  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="rule-b flex h-16 items-center justify-between">
        <span className="display-caps text-xl">Beast</span>
        <nav className="flex items-center gap-5">
          <Link
            href="/how-it-works"
            className="hidden text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink sm:block"
          >
            How it works
          </Link>
          {!DEMO_MODE && (
            <Link
              href="/sign-in"
              className="text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink"
            >
              Sign in
            </Link>
          )}
          <Link href={appHref} className="btn-ink">
            {DEMO_MODE ? "Enter the office" : "Found your company"}
          </Link>
        </nav>
      </header>

      <section className="grid gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:py-20">
        <div className="flex flex-col justify-center">
          <h1 className="display text-5xl lg:text-[4.4rem]">
            An autonomous AI&nbsp;company you&nbsp;manage.
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-secondary">
            Not a chatbot you prompt. You brief jobs, agent employees run them in bounded tool
            loops, deliverables land in your review queue, and your edits become the company&apos;s
            standing operating rules. It gets permanently better every time you review.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={appHref} className="btn-identity">
              {DEMO_MODE ? "Walk into the live office" : "Hire your first employee"}
              <ArrowRight size={15} strokeWidth={2} />
            </Link>
            <Link href="/how-it-works" className="btn-ghost">
              Read the manual
            </Link>
          </div>
          <p className="spec-label mt-5">
            {DEMO_MODE
              ? "Live demo · no signup · every artifact labelled with its provenance"
              : "Runs on your own keys · Stripe test mode · every run inspectable"}
          </p>
        </div>

        <div aria-label="Specimen: a job moving through the loop" className="flex flex-col gap-3">
          <div className="panel p-4">
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
              {TRAIL.map((row) => (
                <li key={row.t} className="flex gap-3">
                  <span className="shrink-0 text-ink-muted">{row.t}</span>
                  <span className="min-w-[72px] shrink-0 font-semibold text-ink">{row.step}</span>
                  <span className="truncate">{row.detail}</span>
                </li>
              ))}
            </ol>
            <p className="spec-label mt-3">Specimen · recorded run · 4 of 11 steps shown</p>
          </div>

          <div className="panel-tinted p-4">
            <p className="spec-label">The operating manual, learned from your edits</p>
            <ul className="mt-2 space-y-2">
              {RULES.map((r) => (
                <li key={r.id} className="flex items-baseline gap-3 text-[13px]">
                  <span className="spec shrink-0 text-ink-muted">{r.id}</span>
                  <span className="flex-1 leading-snug">{r.text}</span>
                  <span className="spec whitespace-nowrap text-ink-muted">
                    {r.n}× · {r.conf}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rule-t grid grid-cols-1 gap-6 py-10 sm:grid-cols-3">
        <div>
          <h2 className="text-[15px] font-semibold">Bounded, inspectable runs</h2>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-secondary">
            Every run is a tool loop with a hard step and time budget, and every deliverable files
            with its full trajectory: each search, source, and rule that shaped it.
          </p>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Review is the interface</h2>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-secondary">
            Work lands in a queue, not a chat. Accept, edit, or reject; the diff of your edit is
            the training signal.
          </p>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Confidence-gated learning</h2>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-secondary">
            Edits become candidate rules that must earn corroboration across reviews before they
            gate future runs. One review never rewrites the company.
          </p>
        </div>
      </section>

      <footer className="rule-t flex flex-wrap items-center justify-between gap-2 py-5">
        <span className="spec-label">
          Beast · Next.js · tRPC · Postgres + pgvector · provider-agnostic agent runtime
        </span>
        <a
          href="https://github.com/advitrocks9/beast"
          target="_blank"
          rel="noreferrer"
          className="text-[13px] font-semibold text-ink underline underline-offset-2"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}
