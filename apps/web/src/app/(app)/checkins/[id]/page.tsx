import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db, companies, checkIns } from "@beast/db";
import { GlassCard } from "@beast/ui";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ response?: string }>;
}

const RESPONSE_LABEL: Record<string, string> = {
  used: "Used it",
  not_used: "Did not use it",
  edited: "Edited it",
};

export default async function CheckInDeeplinkPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { response } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const checkIn = await db.query.checkIns.findFirst({
    where: and(eq(checkIns.id, id), eq(checkIns.companyId, company!.id)),
    columns: {
      id: true,
      acknowledged: true,
      response: true,
      content: true,
    },
  });

  if (!checkIn) notFound();

  // Idempotent: if already acknowledged with this response, skip the write.
  // Fresh response on the same check-in overwrites (founder might click a
  // different button in the email after the first one).
  let acknowledged = checkIn.acknowledged;
  let recordedResponse = checkIn.response;
  if (response && (!acknowledged || checkIn.response !== response)) {
    await db
      .update(checkIns)
      .set({ acknowledged: true, response })
      .where(and(eq(checkIns.id, id), eq(checkIns.companyId, company!.id)));
    acknowledged = true;
    recordedResponse = response;
  }

  const content = checkIn.content as Record<string, unknown> | null;
  const deliverableTitle = content && typeof content.deliverableTitle === "string"
    ? content.deliverableTitle
    : null;

  const responseLabel = recordedResponse ? RESPONSE_LABEL[recordedResponse] ?? recordedResponse : null;

  return (
    <div className="mx-auto max-w-xl py-12">
      <GlassCard hoverable={false} className="p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.15_140)]">
          Check-in recorded
        </p>
        <h1 className="mt-2 font-(--font-display) text-2xl font-bold tracking-tight">
          {responseLabel ? `Logged: ${responseLabel}` : "Thanks for letting us know"}
        </h1>
        {deliverableTitle && (
          <p className="mt-2 text-sm text-text-secondary">
            on <span className="font-medium">{deliverableTitle}</span>
          </p>
        )}
        <p className="mt-4 text-sm text-text-secondary">
          {acknowledged
            ? "Your team will use this signal to shape the next round."
            : "Reply with how it went using the buttons in your Monday email."}
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Back to dashboard
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
