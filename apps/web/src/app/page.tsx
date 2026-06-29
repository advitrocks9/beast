import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { GlassCard } from "@beast/ui";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies } from "@beast/db";
import { LandingNav } from "@/components/landing-nav";

export const metadata = {
  title: "Hire your first AI employee in 90 seconds",
  description:
    "AI marketing manager, SDR, and support lead for non-technical CEOs at 10-50 person companies. Real deliverables, learns your voice, weekly accountability. Flat $99/mo.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Beast - Hire your first AI employee in 90 seconds",
    description:
      "AI marketing manager, SDR, and support lead for non-technical CEOs. Real deliverables, learns your voice, weekly accountability.",
    url: "/",
  },
  twitter: {
    title: "Beast - Hire your first AI employee in 90 seconds",
    description:
      "AI marketing manager, SDR, and support lead. Real deliverables, learns your voice.",
  },
};

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

  return (
    <>
      <LandingNav />
      <main className="bg-bg-warm">
        <Hero />
        <ProblemSection />
        <TeamSection />
        <HowItWorks />
        <Differentiators />
        <PricingTeaser />
        <FooterCta />
        <Footer />
      </main>
    </>
  );
}

function Hero() {
  return (
    <section className="px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[oklch(0.5_0.09_185)]">
          For non-technical CEOs at 10-50 person companies
        </p>
        <h1 className="font-(--font-display) text-4xl font-bold tracking-tight sm:text-6xl">
          Hire your first AI employee in 90 seconds.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-secondary">
          Sintra suggests. Alex finishes. And Alex keeps you accountable.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-base text-text-secondary">
          Beast is an AI marketing manager, SDR, and support lead that
          actually ships work for review, learns your voice from your edits,
          and emails you every Monday with what got done and what is waiting.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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
          Free during private beta. Paid tiers activate at general availability.
        </p>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="border-t border-gray-100 bg-white px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-(--font-display) text-3xl font-bold tracking-tight">
          You are doing three jobs at once.
        </h2>
        <p className="mt-4 text-base text-text-secondary">
          A 25-person company has at least three functions that need attention
          every week: marketing the product, opening sales conversations, and
          replying to support. Hiring three full-time people for that costs
          $300-500K a year. So one person ends up doing all three. Usually you.
        </p>
        <p className="mt-4 text-base text-text-secondary">
          AI agent platforms exist, but most of them are either developer
          toolkits (LangChain, Crew, Mastra) or per-task chatbots that suggest
          drafts and stop. Neither hires the work off your plate.
        </p>
        <p className="mt-4 font-(--font-display) text-2xl font-bold tracking-tight">
          Beast is an AI employee, not an agent toolkit.
        </p>
      </div>
    </section>
  );
}

function TeamSection() {
  const team = [
    {
      name: "Alex",
      role: "Marketing Manager",
      ships: [
        "Competitive teardowns with cited sources",
        "LinkedIn posts in your voice",
        "Cold email drafts pinned to a goal",
      ],
      hookline: "Tell me a competitor and I will start a teardown.",
      tier: "Starter ($99)",
    },
    {
      name: "Jordan",
      role: "SDR",
      ships: [
        "Sequenced cold outreach",
        "Reply triage and next-step suggestions",
        "Pipeline updates against weekly targets",
      ],
      hookline: "Drop me a list of accounts and I will run the first touch.",
      tier: "Team ($299)",
    },
    {
      name: "Sam",
      role: "Support Lead",
      ships: [
        "Replies to support inbox in your voice",
        "Categorized weekly digest",
        "Escalates anything above the autonomy line",
      ],
      hookline: "Forward me your support inbox and I will start replying.",
      tier: "Business ($499)",
    },
  ];

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h2 className="font-(--font-display) text-3xl font-bold tracking-tight">
            Meet the team.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-text-secondary">
            Three AI employees with names, personalities, and clear scope. You
            stay the CEO, they do the work.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {team.map((member) => (
            <GlassCard key={member.name} hoverable={false} className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {member.role}
              </p>
              <h3 className="mt-1 font-(--font-display) text-2xl font-bold tracking-tight">
                {member.name}
              </h3>
              <p className="mt-3 text-sm italic text-text-secondary">
                "{member.hookline}"
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {member.ships.map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[oklch(0.55_0.15_140)]">
                      &#10003;
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-text-muted">
                Available on {member.tier}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Interview, 90 seconds",
      body: "Tell us your company in a short chat. We capture three concrete goals you want shipped this month.",
    },
    {
      n: "2",
      title: "Hire your first employee",
      body: "Alex is yours on day one. Add Jordan and Sam from the dashboard when you are ready.",
    },
    {
      n: "3",
      title: "Review, approve, repeat",
      body: "Real deliverables show up for review. Approve, edit, or reject. Alex learns your voice from every edit.",
    },
  ];

  return (
    <section className="border-t border-gray-100 bg-white px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-(--font-display) text-3xl font-bold tracking-tight">
          How it works.
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-xl border border-gray-100 bg-white p-6">
              <p className="font-(--font-display) text-3xl font-bold tracking-tight text-[oklch(0.5_0.09_185)]">
                {s.n}
              </p>
              <h3 className="mt-2 font-(--font-display) text-lg font-bold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Differentiators() {
  const diffs = [
    {
      title: "Real deliverables, not drafts",
      body: "Sintra and Lindy stop at suggestions. Beast ships finished work for your approval and tracks it through to publication.",
    },
    {
      title: "Learns your voice from your edits",
      body: "Every edit you make becomes a procedural rule. By the third teardown, Alex sounds like you wrote it.",
    },
    {
      title: "Weekly accountability email",
      body: "Every Monday at 9am you get four sections: where you are, what shipped, what is waiting on you, what I want to do next.",
    },
    {
      title: "Flat $99/mo. No credits.",
      body: "No per-task fees, no surprise bills. Predictable pricing that actually fits an SMB budget.",
    },
  ];

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-(--font-display) text-3xl font-bold tracking-tight">
          Why Beast.
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {diffs.map((d) => (
            <GlassCard key={d.title} hoverable={false} className="p-6">
              <h3 className="font-(--font-display) text-lg font-bold tracking-tight">
                {d.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary">{d.body}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="border-t border-gray-100 bg-white px-6 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-(--font-display) text-3xl font-bold tracking-tight">
          Three tiers. Flat monthly.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-text-secondary">
          $99 for Alex. $299 to add Jordan or Sam. $499 for the full team plus
          per-function autonomy controls. No credits, no per-task fees, no
          surprise bills.
        </p>
        <div className="mt-8">
          <Link
            href="/pricing"
            className="inline-block rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-black hover:bg-gray-50"
          >
            See full pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

function FooterCta() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-(--font-display) text-3xl font-bold tracking-tight">
          Stop doing three jobs at once.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-base text-text-secondary">
          Hire Alex in 90 seconds. Free during private beta.
        </p>
        <div className="mt-8">
          <Link
            href="/sign-up"
            className="inline-block rounded-xl bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            Hire your first employee
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-xs text-text-muted sm:flex-row">
        <p>Beast - AI employees for non-technical CEOs.</p>
        <nav className="flex gap-4">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-up" className="hover:text-foreground">
            Sign up
          </Link>
        </nav>
      </div>
    </footer>
  );
}
