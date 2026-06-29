import { sql, eq } from "drizzle-orm";
import { schedules } from "@trigger.dev/sdk";
import { companies } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

export interface DbHealth {
  status: "healthy" | "drifted" | "unknown";
  journalRowCount: number | null;
  message: string;
}

export const systemRouter = createTRPCRouter({
  /**
   * Best-effort read of drizzle.__drizzle_migrations row count. Empty
   * journal with non-empty schema is the drift state. The
   * /settings/danger page surfaces the result so the founder can act.
   */
  dbHealth: protectedProcedure.query(async ({ ctx }): Promise<DbHealth> => {
    try {
      const result = await ctx.db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
      );
      const row = result[0] ?? Array.from(result as unknown as Iterable<{ n: number }>)[0];
      const journalRowCount = typeof row?.n === "number" ? row.n : null;

      if (journalRowCount === null) {
        return {
          status: "unknown",
          journalRowCount: null,
          message: "Could not read drizzle.__drizzle_migrations row count.",
        };
      }
      if (journalRowCount === 0) {
        return {
          status: "drifted",
          journalRowCount: 0,
          message: "drizzle.__drizzle_migrations is empty. Migrations are not tracked on prod.",
        };
      }
      return {
        status: "healthy",
        journalRowCount,
        message: `${journalRowCount} migrations tracked.`,
      };
    } catch (err) {
      return {
        status: "unknown",
        journalRowCount: null,
        message: err instanceof Error ? err.message : "Health check failed.",
      };
    }
  }),

  /**
   * Service configuration overview for the founder. Reads env-var
   * presence for each external integration the codebase depends on.
   * Drives the External services section on /settings/connectors so a
   * founder seeing "agents do not run web search" can jump straight to
   * "Serper is unconfigured" instead of grepping logs.
   */
  integrations: protectedProcedure.query(async () => {
    const present = (key: string): boolean => {
      const v = process.env[key];
      return typeof v === "string" && v.length > 0;
    };

    return [
      {
        key: "anthropic",
        label: "Anthropic",
        category: "core" as const,
        envKeys: ["ANTHROPIC_API_KEY"],
        configured: present("ANTHROPIC_API_KEY"),
        notes: "Required for every agent run. Without it the worker fails before the first iteration.",
      },
      {
        key: "gemini",
        label: "Gemini embeddings",
        category: "core" as const,
        envKeys: ["GEMINI_API_KEY"],
        configured: present("GEMINI_API_KEY"),
        notes: "Required for memory retrieval + KB search. Without it episodic recall returns empty.",
      },
      {
        key: "serper",
        label: "Serper search",
        category: "tool" as const,
        envKeys: ["SERPER_API_KEY"],
        configured: present("SERPER_API_KEY"),
        notes: "Web search tool. Agents skip the tool when missing; output quality drops.",
      },
      {
        key: "firecrawl",
        label: "Firecrawl",
        category: "tool" as const,
        envKeys: ["FIRECRAWL_API_KEY"],
        configured: present("FIRECRAWL_API_KEY"),
        notes: "Competitor scan tool + /knowledge URL crawl. Workers skip when missing.",
      },
      {
        key: "unstructured",
        label: "Unstructured",
        category: "tool" as const,
        envKeys: ["UNSTRUCTURED_API_KEY"],
        configured: present("UNSTRUCTURED_API_KEY"),
        notes: "PDF + docx + doc ingestion. Without it /knowledge falls back to .txt/.md only.",
      },
      {
        key: "resend",
        label: "Resend email",
        category: "outbound" as const,
        envKeys: ["RESEND_API_KEY", "EMAIL_FROM"],
        configured: present("RESEND_API_KEY") && present("EMAIL_FROM"),
        notes: "Daily digest emails. Worker exits early when either RESEND_API_KEY or EMAIL_FROM is missing.",
      },
    ];
  }),

  /**
   * Re-fire the schedules.create calls that completeHiring runs on
   * onboarding. Idempotent via deduplicationKey: if the orchestrator-tick
   * and nightly-maintenance schedules already exist for this company,
   * Trigger.dev returns the existing rows. Closes the silent-dead-tenant
   * gap for accounts that completed onboarding before the schedule
   * registration shipped.
   */
  registerSchedules: protectedProcedure.mutation(async ({ ctx }) => {
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
      columns: { timezone: true },
    });
    const tz = company?.timezone ?? "UTC";

    const [tickHandle, nightlyHandle] = await Promise.all([
      schedules.create({
        task: "orchestrator-tick",
        cron: "*/5 * * * *",
        timezone: tz,
        externalId: ctx.companyId,
        deduplicationKey: `${ctx.companyId}-tick`,
      }),
      schedules.create({
        task: "nightly-maintenance",
        cron: "0 23 * * *",
        timezone: tz,
        externalId: ctx.companyId,
        deduplicationKey: `${ctx.companyId}-nightly`,
      }),
    ]);

    return {
      timezone: tz,
      tickScheduleId: tickHandle.id,
      nightlyScheduleId: nightlyHandle.id,
    };
  }),
});
