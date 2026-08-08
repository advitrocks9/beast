import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db, companies, checkIns, aiEmployees } from "@beast/db";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ response?: string }>;
}

const RESPONSES = [
  { value: "used", label: "Used it", status: "accepted" },
  { value: "edited", label: "Edited it", status: "revised" },
  { value: "not_used", label: "Did not use it", status: "rejected" },
] as const;

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
      aiEmployeeId: true,
      acknowledged: true,
      response: true,
      content: true,
    },
  });

  if (!checkIn) notFound();

  const employee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, checkIn.aiEmployeeId),
    columns: { name: true, roleType: true },
  });

  // Idempotent: if already acknowledged with this response, skip the write.
  // A fresh response on the same check-in overwrites.
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
  const deliverableTitle =
    content && typeof content.deliverableTitle === "string" ? content.deliverableTitle : null;

  const recorded = recordedResponse
    ? RESPONSES.find((r) => r.value === recordedResponse)
    : undefined;

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="panel">
        <header className="rule-b flex items-center gap-3 px-5 py-4">
          <Monogram name={employee?.name ?? "?"} roleType={employee?.roleType} size="md" />
          <div className="min-w-0">
            <p className="text-[15px] leading-tight font-semibold">
              {employee?.name ?? "Check-in"} · follow-up memo
            </p>
            {deliverableTitle && (
              <p className="spec-label mt-0.5 truncate">{deliverableTitle}</p>
            )}
          </div>
        </header>

        <div className="px-5 py-4">
          <p className="text-[15px] leading-snug font-semibold">
            Did you end up using {employee?.name ? `${employee.name}'s` : "this"} work?
          </p>

          {acknowledged && recorded ? (
            <div className="mt-3">
              <p className="spec-label">Recorded</p>
              <p className="mt-1.5">
                <StateChip status={recorded.status} label={recorded.label} className="stamp-in" />
              </p>
              <p className="mt-3 text-[13px] leading-snug text-ink-secondary">
                Logged. The answer feeds the same signal loop as a review, so follow-through shapes
                what gets made next.
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-[13px] leading-snug text-ink-secondary">
                Answer here or with the buttons in the Monday email. Either way it lands on the
                record.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {RESPONSES.map((r) => (
                  <Link key={r.value} href={`/checkins/${id}?response=${r.value}`} className="btn-ghost">
                    {r.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="hairline-t flex items-center justify-between px-5 py-3">
          <Link href="/checkins" className="spec-label transition-colors hover:text-ink">
            All check-ins
          </Link>
          <Link
            href="/dashboard"
            className="text-[13px] font-semibold text-ink underline underline-offset-2"
          >
            Back to the office
          </Link>
        </footer>
      </div>
    </div>
  );
}
