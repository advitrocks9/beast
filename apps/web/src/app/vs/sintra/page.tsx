import Link from "next/link";
import { GlassCard } from "@beast/ui";
import { LandingNav } from "@/components/landing-nav";

export const metadata = {
  title: "Beast vs Sintra - One AI marketing manager, not twelve helpers",
  description:
    "Public-source comparison of Sintra AI and Beast on memory, source grounding, and team metaphor. With citations.",
  alternates: { canonical: "/vs/sintra" },
  openGraph: {
    title: "Beast vs Sintra - One manager, not twelve helpers",
    description:
      "Comparison on memory, source grounding, and team metaphor. Cited from Lindy and Zaturn public materials.",
    url: "/vs/sintra",
  },
  twitter: {
    title: "Beast vs Sintra",
    description:
      "One AI manager that remembers, cites, finishes work. Not twelve helpers you coordinate.",
  },
};

export default function VsSintraPage() {
  return (
    <>
      <LandingNav />
      <main className="bg-bg-warm">
        <Hero />
        <Differentiators />
        <ComparisonTable />
        <Sources />
        <FooterCta />
      </main>
    </>
  );
}

function Hero() {
  return (
    <section className="px-6 pt-20 pb-14 sm:pt-28 sm:pb-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[oklch(0.5_0.09_185)]">
          Beast vs Sintra AI
        </p>
        <h1 className="font-(--font-display) text-4xl font-bold tracking-tight sm:text-5xl">
          Sintra suggests. Alex finishes.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-secondary">
          A public-source comparison drawn from third-party reviews and a
          live sample teardown. Three structural differences below.
        </p>
        <p className="mt-3 text-xs text-text-muted">
          Last updated 2026-05-04. Founder-run head-to-head sign-up test.
        </p>
      </div>
    </section>
  );
}

function Differentiators() {
  const items = [
    {
      tag: "Memory",
      headline: "Alex remembers what you said you wanted.",
      claim:
        "Sintra's helpers run as isolated chats. Each helper has no awareness of what another helper did, what you approved last week, or what your three monthly goals are. Beast pins a goal at task creation, runs a 4-layer memory store (working, episodic, semantic, procedural), and updates a procedural rule every time you edit Alex's output. By the third teardown, Alex sounds like you wrote it.",
      citation:
        "Lindy: \"Some helpers follow similar patterns, which leads to similar drafts.\" \"Forces manual draft transfers.\"",
      cite_href: "https://www.lindy.ai/blog/sintra-ai-review",
      cite_label: "lindy.ai/blog/sintra-ai-review",
    },
    {
      tag: "Source grounding",
      headline: "Alex shows you what she read.",
      claim:
        "Sintra outputs do not cite sources. Beast ships teardowns with sources cited per section, and renders the reasoning trail on the review page so you can see what Alex read and rebut anything you disagree with.",
      citation:
        "Zaturn: outputs are \"strong first drafts. They consistently provide clean structure, clear language, and an on-brand tone.\" Excels at \"functional, on-brand content rather than award-winning creative work.\"",
      cite_href: "https://zaturn.ai/blog/sintra-ai-review",
      cite_label: "zaturn.ai/blog/sintra-ai-review",
    },
    {
      tag: "One AI manager, not twelve helpers",
      headline: "One person to manage, not a department to coordinate.",
      claim:
        "Sintra ships 12 helpers (Penn, Emmie, Soshie, Seomi, Dexter, Gigi, Cassie, Scouty, Buddy, Commet, Milli, Vizzy). They share no context and cannot coordinate. Beast ships three named AI employees with role-specific persona, cross-employee handoffs at the Team tier, and per-function autonomy controls at the Business tier.",
      citation:
        "Lindy reviewer's most-used helpers: Penn (copywriter) and Emmie (email marketer). Other helpers fall away because per-helper credit cost outweighs marginal value. Twelve metaphors, two used.",
      cite_href: "https://www.lindy.ai/blog/sintra-ai-review",
      cite_label: "lindy.ai/blog/sintra-ai-review",
    },
  ];

  return (
    <section className="border-t border-gray-100 bg-white px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-(--font-display) text-3xl font-bold tracking-tight">
          Three structural differences.
        </h2>
        <div className="mt-12 space-y-6">
          {items.map((item) => (
            <GlassCard key={item.tag} hoverable={false} className="p-7">
              <p className="text-xs font-semibold uppercase tracking-wider text-[oklch(0.5_0.09_185)]">
                {item.tag}
              </p>
              <h3 className="mt-2 font-(--font-display) text-2xl font-bold tracking-tight">
                {item.headline}
              </h3>
              <p className="mt-4 text-base text-text-secondary">{item.claim}</p>
              <p className="mt-5 border-l-2 border-gray-200 pl-4 text-sm italic text-text-muted">
                {item.citation}
              </p>
              <p className="mt-3 text-xs">
                <Link
                  href={item.cite_href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[oklch(0.5_0.09_185)] hover:underline"
                >
                  Source: {item.cite_label}
                </Link>
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonTable() {
  const rows = [
    {
      dimension: "Output volume per task",
      sintra: "High; multiple cheap drafts per helper",
      beast: "Single deep deliverable per task",
    },
    {
      dimension: "Source grounding",
      sintra: "No citations",
      beast: "Sources cited per section",
    },
    {
      dimension: "Analytical depth",
      sintra: "First-draft, structurally repetitive",
      beast: "Multi-source synthesis with named wedge",
    },
    {
      dimension: "Goal pinning",
      sintra: "Out of scope. Helpers do not share context.",
      beast: "Goal-pinned opening line on every output",
    },
    {
      dimension: "Cross-task memory",
      sintra: "None. Per-helper chats isolated.",
      beast: "4-layer memory: working, episodic, semantic, procedural",
    },
    {
      dimension: "Pricing shape",
      sintra: "Credit math, helper-by-helper escalation",
      beast: "Flat $99/$299/$499 monthly",
    },
    {
      dimension: "Output revision loop",
      sintra: "Manual chat re-prompting",
      beast: "Approve, chips, pinned-goal feedback becomes procedural memory",
    },
    {
      dimension: "Speed to first draft",
      sintra: "Faster (templated)",
      beast: "Slower; it runs real web research first",
    },
  ];

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-(--font-display) text-3xl font-bold tracking-tight">
          Head to head.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-text-secondary">
          Drawn from public reviews of Sintra and a sample teardown of Sintra
          produced by Alex.
        </p>
        <div className="mt-10 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">Dimension</th>
                <th className="px-5 py-3 text-left font-semibold">Sintra</th>
                <th className="px-5 py-3 text-left font-semibold">Beast</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.dimension}
                  className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="px-5 py-3 font-medium">{r.dimension}</td>
                  <td className="px-5 py-3 text-text-secondary">{r.sintra}</td>
                  <td className="px-5 py-3 text-text-secondary">{r.beast}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Sources() {
  const sources = [
    {
      label: "Lindy AI on Sintra AI Review",
      href: "https://www.lindy.ai/blog/sintra-ai-review",
    },
    {
      label: "Zaturn AI on Sintra Review 2026",
      href: "https://zaturn.ai/blog/sintra-ai-review",
    },
    {
      label: "Cybernews on Sintra AI",
      href: "https://cybernews.com/ai-tools/sintra-ai-review/",
    },
    {
      label: "Efficient App on Sintra AI",
      href: "https://efficient.app/apps/sintra",
    },
    {
      label: "TopAIChoices on Sintra Review",
      href: "https://topaichoices.com/sintra-review-can-you-really-replace-employees-with-ai-helpers/",
    },
    {
      label: "Slashdot Sintra AI Reviews",
      href: "https://slashdot.org/software/p/Sintra-AI/",
    },
  ];

  return (
    <section className="border-t border-gray-100 bg-white px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
          Sources
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Public reviews and a founder-run sample teardown.
        </p>
        <ul className="mt-5 space-y-2 text-sm">
          {sources.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[oklch(0.5_0.09_185)] hover:underline"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-text-muted">
          A founder-run side-by-side sign-up test is queued. Sintra's trial
          requires a credit card and a real email, both pending founder
          authorization. Once run, the result will be published here.
        </p>
      </div>
    </section>
  );
}

function FooterCta() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-(--font-display) text-3xl font-bold tracking-tight">
          Ready to hire one AI manager instead of twelve helpers?
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            Hire your first employee
          </Link>
          <Link
            href="/pricing"
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-black hover:bg-gray-50"
          >
            See pricing
          </Link>
        </div>
        <p className="mt-5 text-xs text-text-muted">
          Free during private beta.
        </p>
      </div>
    </section>
  );
}
