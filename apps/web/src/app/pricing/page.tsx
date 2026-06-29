import Link from "next/link";
import { Brain, Quote, Calendar, ShieldCheck } from "lucide-react";
import { GlassCard } from "@beast/ui";

export const metadata = {
  title: "Pricing",
  description:
    "$99/mo flat for one AI employee. Team and Business tiers add the rest. No credits, no per-task fees, no surprise bills.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Beast pricing - $99/mo flat",
    description:
      "Transparent pricing. No credits, no per-task fees, no surprise bills.",
    url: "/pricing",
  },
  twitter: {
    title: "Beast pricing - $99/mo flat",
    description:
      "No credits, no per-task fees. Starter $99, Team $299, Business $499.",
  },
};

interface Tier {
  name: string;
  price: number;
  tagline: string;
  features: string[];
  cta: { label: string; href: string };
  trial: string;
  emphasis?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Starter",
    price: 99,
    tagline: "One AI marketing manager. Real deliverables. Weekly check-in.",
    features: [
      "Alex (AI marketing manager)",
      "Up to 50 deliverables / month",
      "Goal capture at onboarding",
      "Reasoning trail on every output",
      "Monday weekly check-in email",
    ],
    cta: { label: "Hire Alex", href: "/sign-up" },
    trial: "Free for 14 days. Cancel any time.",
  },
  {
    name: "Team",
    price: 299,
    tagline: "Add Jordan (sales) or Sam (support). Cross-employee handoffs.",
    features: [
      "Two AI employees",
      "Up to 200 deliverables / month",
      "Cross-department FYI on shared work",
      "Procedural memory of your edits",
      "Priority weekly check-in",
    ],
    cta: { label: "Hire the team", href: "/sign-up" },
    trial: "14-day free trial. No card required.",
    emphasis: true,
  },
  {
    name: "Business",
    price: 499,
    tagline: "All three employees. Custom autonomy levels per function.",
    features: [
      "Alex + Jordan + Sam",
      "Unlimited deliverables",
      "Per-function autonomy controls",
      "Cross-employee shared memory",
      "Founder approval workflow",
    ],
    cta: { label: "Hire all three", href: "/sign-up" },
    trial: "14-day free trial. No card required.",
  },
];

interface Anchor {
  label: string;
  price: string;
  hex: string;
}

const ANTI_ANCHORS: Anchor[] = [
  { label: "A real marketing manager", price: "$6,000 - $10,000 / mo", hex: "#6B7280" },
  { label: "ChatGPT or Claude direct", price: "$20 / mo, you write the prompts", hex: "#6B7280" },
  { label: "Beast Starter", price: "$99 / mo flat", hex: "#0a0a0a" },
];

interface Pillar {
  Icon: typeof Brain;
  label: string;
  detail: string;
  hex: string;
}

const EVERY_PLAN: Pillar[] = [
  {
    Icon: Brain,
    label: "Memory that learns your voice",
    detail:
      "Every approval and edit teaches the model. Outputs sound more like you each week.",
    hex: "#E87B35",
  },
  {
    Icon: Quote,
    label: "Source grounding",
    detail:
      "Every claim cites where it came from. No silent hallucinations.",
    hex: "#3B82F6",
  },
  {
    Icon: Calendar,
    label: "Weekly check-in",
    detail:
      "Monday morning email with what shipped and what is awaiting your approval.",
    hex: "#22C55E",
  },
  {
    Icon: ShieldCheck,
    label: "Founder approval gate",
    detail:
      "External-facing work requires your sign-off before it leaves the system.",
    hex: "#A855F7",
  },
];

const TRUST_CLAIMS = [
  "Data not used to train models",
  "SOC 2 in flight",
  "GDPR aligned",
  "Self-serve export and delete",
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA] px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        {/* Hero */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-text-secondary">
            Pricing
          </p>
          <h1 className="font-(--font-display) text-4xl font-bold tracking-tight sm:text-5xl">
            $99/mo flat.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-text-secondary">
            No credits. No per-task fees. No surprise bills.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-text-muted">
            Predictable monthly billing. Cancel any time.
          </p>
        </div>

        {/* Anti-anchor strip */}
        <div className="mb-12 rounded-2xl bg-[oklch(0.97_0.005_260)] px-6 py-7">
          <div className="mx-auto max-w-2xl">
            {ANTI_ANCHORS.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between border-b border-[oklch(0.9_0.005_260)] py-2.5 last:border-b-0"
              >
                <span
                  className="text-sm"
                  style={{ color: row.hex === "#0a0a0a" ? row.hex : "#525252" }}
                >
                  {row.label}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: row.hex }}
                >
                  {row.price}
                </span>
              </div>
            ))}
            <p className="mt-3 text-xs text-text-muted">
              Source: BLS 2024 (US median for marketing managers at SMBs), openai.com/chatgpt/pricing
            </p>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((t) => (
            <GlassCard
              key={t.name}
              hoverable={false}
              className={`flex flex-col p-7 ${
                t.emphasis
                  ? "ring-2 ring-[oklch(0.7_0.15_30)] shadow-lg"
                  : ""
              }`}
            >
              {t.emphasis && (
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[oklch(0.55_0.18_30)]">
                  Most popular
                </p>
              )}
              <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
                {t.name}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">{t.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-(--font-display) text-4xl font-bold tracking-tight">
                  ${t.price}
                </span>
                <span className="text-sm text-text-muted">/mo</span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{t.trial}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[oklch(0.55_0.15_140)]">
                      &#10003;
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <Link
                  href={t.cta.href}
                  className={`block w-full rounded-xl px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                    t.emphasis
                      ? "bg-black text-white hover:bg-gray-800"
                      : "border border-gray-200 bg-white text-black hover:bg-gray-50"
                  }`}
                >
                  {t.cta.label}
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* What's in every plan */}
        <div className="mt-20">
          <h2 className="text-center font-(--font-display) text-2xl font-bold tracking-tight">
            What is in every plan
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
            {EVERY_PLAN.map(({ Icon, label, detail, hex }) => (
              <div key={label} className="text-left">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${hex}20`, color: hex }}
                >
                  <Icon size={18} strokeWidth={2} />
                </div>
                <p className="mt-3 text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Differentiator strip */}
        <div className="mt-20">
          <h2 className="text-center font-(--font-display) text-2xl font-bold tracking-tight">
            Why flat monthly?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-text-secondary">
            Every other AI agent platform either hides pricing behind sales
            calls or charges you per credit, per task, or per resolution. Flat
            monthly is the only model that lets you predict your bill before
            you ship the work.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <ComparisonCard
              competitor="Lindy"
              shape="Credit-based"
              detail="Simple actions cost 1 credit. Web research costs 5-10 credits. Add-ons at $10 / 1,000 credits."
              cite="lindy.ai/pricing"
            />
            <ComparisonCard
              competitor="Devin"
              shape="Pay-as-you-go ACU"
              detail="$2-2.25 per Agent Compute Unit (~15 min of work). Bill scales with how complex the task turns out."
              cite="devin.ai/pricing"
            />
            <ComparisonCard
              competitor="Sierra"
              shape="Outcome-based, contact sales"
              detail="$150-250K / yr platform plus $50-200K setup. No published pricing. Year-one budget $200-350K+."
              cite="lorikeetcx.ai"
            />
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <h2 className="text-center font-(--font-display) text-2xl font-bold tracking-tight">
            Common questions
          </h2>
          <div className="mt-8 space-y-3">
            <Faq
              q="What is actually a deliverable?"
              a="A finished piece of work an AI employee ships for your review: a competitive teardown, a cold email, a LinkedIn post, a support response. We count one deliverable per approve."
            />
            <Faq
              q="What if I cancel mid-month?"
              a="You get a prorated refund for the unused portion. We do not bill on the next cycle. Your AI employee's memory and your knowledge base stay in your account for 90 days in case you come back."
            />
            <Faq
              q="Do you train on my data?"
              a="No. Your knowledge base, memories, and deliverables are not used to train models. Anthropic's API also has zero data retention configured for our account."
            />
            <Faq
              q="Which AI model is this?"
              a="Claude Sonnet 4.x by default. Heavier strategy work uses Opus. Cheap deterministic tasks (formatting, classification) use Haiku. We route per task to keep your bill predictable."
            />
            <Faq
              q="What happens to my data if I leave?"
              a="Export everything (knowledge, deliverables, memories) as JSON from Settings then Danger then Export. After 90 days of inactivity we hard delete. No 'we keep it forever' clause."
            />
            <Faq
              q="Can I add a second AI employee mid-cycle?"
              a="Yes. We prorate the upgrade and bill the difference on the next cycle. You do not lose Alex's memory by upgrading to Team."
            />
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-20 rounded-2xl bg-[oklch(0.96_0.005_260)] px-8 py-12 text-center">
          <h2 className="font-(--font-display) text-3xl font-bold tracking-tight">
            Hire your first AI employee in 90 seconds.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
            Three questions. One product pick. No credit card.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="inline-block rounded-xl bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              Hire Alex
            </Link>
            <a
              href="mailto:advit@beast.team"
              className="inline-block rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-black hover:bg-gray-50"
            >
              Talk to a real human
            </a>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center">
          {TRUST_CLAIMS.map((claim, i) => (
            <span key={claim} className="flex items-center gap-3 text-xs text-text-muted">
              {claim}
              {i < TRUST_CLAIMS.length - 1 && (
                <span className="text-text-muted/40">|</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

function ComparisonCard({
  competitor,
  shape,
  detail,
  cite,
}: {
  competitor: string;
  shape: string;
  detail: string;
  cite: string;
}) {
  return (
    <GlassCard hoverable={false} className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {competitor}
      </p>
      <p className="mt-1 text-sm font-semibold">{shape}</p>
      <p className="mt-2 text-sm text-text-secondary">{detail}</p>
      <p className="mt-3 text-xs text-text-muted">Source: {cite}</p>
    </GlassCard>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <p className="text-sm font-semibold">{q}</p>
      <p className="mt-2 text-sm text-text-secondary">{a}</p>
    </div>
  );
}
