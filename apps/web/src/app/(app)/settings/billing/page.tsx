import { headers } from "next/headers";
import { and, count, eq, gte } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere } from "@/lib/demo-overlay";
import { db, companies, tasks, aiEmployees } from "@beast/db";
import { PAID_TIERS, TIER_LIMITS, type PaidTier } from "@beast/shared";
import { readTier } from "@/lib/entitlements";
import { ProvenanceTag } from "@/components/provenance-tag";
import { CheckoutButton, PortalButton } from "./_components/billing-actions";

const TIER_PRICES: Record<PaidTier, number> = { starter: 99, team: 299, business: 499 };

const TIER_NAMES: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  team: "Team",
  business: "Business",
};

export default async function SettingsBillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: {
      id: true,
      billingTier: true,
      billingStatus: true,
      trialEndsAt: true,
      stripeSubscriptionId: true,
    },
  });

  const tier = readTier(company!);
  const limits = TIER_LIMITS[tier];
  const scope = demoWhere(demoSid);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [taskRows, employeeRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.companyId, company!.id),
          gte(tasks.createdAt, startOfMonth),
          scope.seedOrMine(tasks.demoSessionId),
        ),
      ),
    db
      .select({ value: count() })
      .from(aiEmployees)
      .where(eq(aiEmployees.companyId, company!.id)),
  ]);

  const tasksUsed = taskRows[0]?.value ?? 0;
  const employeesUsed = employeeRows[0]?.value ?? 0;
  const trialDaysRemaining = company!.trialEndsAt
    ? Math.max(0, Math.ceil((company!.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : null;
  const hasSubscription = !!company!.stripeSubscriptionId;

  return (
    <div className="space-y-6">
      <p className="spec-label border border-hairline bg-panel px-3.5 py-2.5">
        Stripe test mode
      </p>

      <section aria-label="Plan">
        <div className="rule-t flex items-baseline justify-between pt-2.5">
          <h2 className="text-[15px] font-semibold">Plan</h2>
          {DEMO_MODE && <ProvenanceTag kind="stub" />}
        </div>
        <p className="display mt-2 text-2xl">{TIER_NAMES[tier] ?? tier}</p>
        <dl className="mt-2">
          <SpecRow label="Status">{company!.billingStatus}</SpecRow>
          {trialDaysRemaining !== null && (
            <SpecRow label="Trial remaining">
              {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"}
            </SpecRow>
          )}
          <SpecRow label="Subscription">{hasSubscription ? "on file" : "none"}</SpecRow>
        </dl>
      </section>

      <section aria-label="Usage this month">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">Usage this month</h2>
        </div>
        <dl className="mt-2">
          <SpecRow label="Jobs commissioned">
            {tasksUsed} / {limits.tasksPerMonth}
          </SpecRow>
          <SpecRow label="Employees on the roster">
            {employeesUsed} / {limits.employees}
          </SpecRow>
        </dl>
        <p className="mt-2 text-[13px] text-ink-muted">
          Both limits are enforced at commission and hire time. Past either, the action names the
          plan that lifts it.
        </p>
      </section>

      <section aria-label="Plans">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">Plans</h2>
        </div>
        <ul className="mt-1">
          {PAID_TIERS.map((t) => {
            const l = TIER_LIMITS[t];
            const current = t === tier;
            return (
              <li
                key={t}
                className="hairline-b flex flex-wrap items-center gap-3 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-tight font-semibold">{TIER_NAMES[t]}</p>
                  <p className="spec mt-0.5 text-ink-muted">
                    ${TIER_PRICES[t]}/mo · {l.tasksPerMonth} jobs/mo · {l.employees} employee
                    {l.employees === 1 ? "" : "s"}
                  </p>
                </div>
                {current ? (
                  <span className="spec-label shrink-0">Current plan</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-2">
                    {DEMO_MODE && <ProvenanceTag kind="stub" />}
                    <CheckoutButton
                      tier={t}
                      label={`Move to ${TIER_NAMES[t]}`}
                      disabled={DEMO_MODE}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Manage">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">Manage</h2>
        </div>
        {hasSubscription ? (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <PortalButton disabled={DEMO_MODE} />
              {DEMO_MODE && <ProvenanceTag kind="stub" />}
            </div>
            <p className="mt-2 text-[13px] text-ink-muted">
              Payment method, invoices, and cancellation live in the Stripe portal.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-ink-muted">
            No subscription on file. Choosing a plan above opens checkout and creates one.
          </p>
        )}
      </section>
    </div>
  );
}

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2 last:border-b-0">
      <dt className="spec-label shrink-0">{label}</dt>
      <dd className="spec text-right">{children}</dd>
    </div>
  );
}
