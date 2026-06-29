import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and, isNotNull } from "drizzle-orm";
import { db, deliverables, aiEmployees } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { scrubPII } from "@/lib/share/scrub";

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

interface PageProps {
  params: Promise<{ shareSlug: string }>;
  searchParams: Promise<{ ref?: string }>;
}

export const metadata = {
  title: "Shared with you - Beast",
  description: "A teardown shared from Beast. Sent by a friend.",
};

export default async function SharePage({ params, searchParams }: PageProps) {
  const { shareSlug } = await params;
  const { ref } = await searchParams;

  const deliverable = await db.query.deliverables.findFirst({
    where: and(
      eq(deliverables.shareSlug, shareSlug),
      isNotNull(deliverables.shareEnabledAt),
    ),
    columns: {
      id: true,
      title: true,
      deliverableType: true,
      content: true,
      shareSnapshot: true,
      aiEmployeeId: true,
      shareEnabledAt: true,
    },
  });

  if (!deliverable) notFound();

  const employee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, deliverable.aiEmployeeId),
    columns: { name: true, roleType: true },
  });

  const employeeName = employee?.name ?? "Beast";
  const roleHex = ROLE_COLORS[employee?.roleType ?? "marketing"] ?? "#9CA3AF";
  // Prefer share-time snapshot; fall back to live content
  // for older shares.
  const sourceContent = (deliverable.shareSnapshot ?? deliverable.content) as Record<string, unknown>;
  const scrubbed = scrubPII(sourceContent);

  const pickString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const mainContent = pickString(scrubbed.content)
    ?? pickString(scrubbed.body)
    ?? pickString(scrubbed.response)
    ?? JSON.stringify(scrubbed, null, 2);

  const signUpHref = ref ? `/sign-up?ref=${encodeURIComponent(ref)}` : "/sign-up";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:py-12">
      <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
        Sent by a friend on Beast
      </div>

      <h1 className="font-(--font-display) text-3xl font-bold tracking-tight">
        {deliverable.title}
      </h1>

      <p className="text-sm text-text-secondary">
        Made by <span style={{ color: roleHex }} className="font-medium">{employeeName}</span>
      </p>

      <GlassCard hoverable={false} className="p-8">
        <div className="prose prose-sm max-w-none">
          {mainContent.split("\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </GlassCard>

      <FooterCta employeeName={employeeName} signUpHref={signUpHref} hasRef={Boolean(ref)} />
    </div>
  );
}

function FooterCta({
  employeeName,
  signUpHref,
  hasRef,
}: {
  employeeName: string;
  signUpHref: string;
  hasRef: boolean;
}) {
  return (
    <GlassCard hoverable={false} className="p-6 text-center">
      <p className="font-(--font-display) text-lg font-semibold">
        Made by {employeeName} on Beast
      </p>
      <p className="mt-1 text-sm text-text-secondary">
        {employeeName} is your AI marketing manager. She finishes the work and remembers your goals.
      </p>
      <Link
        href={signUpHref}
        className="mt-4 inline-block rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Hire your own {employeeName} {hasRef && <span className="text-xs opacity-80">(14-day skip-paywall)</span>}
      </Link>
    </GlassCard>
  );
}
