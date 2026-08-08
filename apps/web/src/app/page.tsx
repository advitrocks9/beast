import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies } from "@beast/db";
import { DEMO_MODE } from "@/lib/demo";
import { LandingSpecimen } from "@/components/landing-specimen";
import { SplitRise } from "@/components/motion/split-rise";
import { RiseIn } from "@/components/motion/rise-in";
import { SmoothScrollRoot } from "@/components/motion/smooth-scroll";

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


export default async function Home() {
  // The demo auth stub makes every visitor "signed in"; the landing must stay
  // reachable as the cold visitor's first page, so only product mode bounces.
  if (!DEMO_MODE) {
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
  }

  const appHref = DEMO_MODE ? "/dashboard" : "/sign-up";

  return (
    <SmoothScrollRoot>
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
          <SplitRise
            as="h1"
            className="display text-[2.4rem] sm:text-5xl lg:text-[4.4rem]"
            text="An autonomous AI company you manage."
          />
          <RiseIn delay={0.35}>
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
          </RiseIn>
        </div>

        <LandingSpecimen />
      </section>

      <section className="rule-t py-10">
        <RiseIn inView className="grid grid-cols-1 gap-6 sm:grid-cols-3">
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
        </RiseIn>
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
    </SmoothScrollRoot>
  );
}
