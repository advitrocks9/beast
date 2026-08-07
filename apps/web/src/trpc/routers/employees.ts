import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { aiEmployees, activityLog, companies } from "@beast/db";
import { getPersona, getEmployeeName, getRoleTitle, seedFounderRule } from "@beast/ai";
import { createTRPCRouter, protectedProcedure } from "../init";

const DEFAULT_AUTONOMY = {
  publishSocial: "permission",
  sendEmail: "permission",
  reachOut: "permission",
  createContent: "auto",
  researchTopics: "auto",
};

const DEFAULT_PERSONALITY: Record<string, object> = {
  marketing: {
    communicationStyle: "energetic, professional, clear",
    strengths: ["content marketing", "SEO", "social media", "brand storytelling"],
    traits: ["data-backed", "audience-focused", "ready-to-publish quality"],
  },
  sales: {
    communicationStyle: "direct, warm, consultative",
    strengths: ["prospect research", "email sequences", "objection handling", "personalization"],
    traits: ["personal-not-templated", "pain-point-led", "concise"],
  },
  support: {
    communicationStyle: "calm, empathetic, thorough",
    strengths: ["customer support", "KB management", "escalation triage", "pattern detection"],
    traits: ["first-reply-solving", "step-by-step", "knows-when-to-escalate"],
  },
};

export const employeesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, ctx.companyId),
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.aiEmployees.findFirst({
        where: and(eq(aiEmployees.id, input.id), eq(aiEmployees.companyId, ctx.companyId)),
      });
    }),

  hire: protectedProcedure
    .input(z.object({
      roleType: z.enum(["marketing", "sales", "support"]),
      initialFocus: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { name: true },
      });

      const systemPrompt = getPersona(input.roleType, company?.name ?? "your company");

      const employee = await ctx.db.transaction(async (tx) => {
        const [created] = await tx.insert(aiEmployees).values({
          companyId: ctx.companyId,
          name: getEmployeeName(input.roleType),
          roleTitle: getRoleTitle(input.roleType),
          roleType: input.roleType,
          personality: DEFAULT_PERSONALITY[input.roleType]!,
          systemPrompt,
          autonomySettings: DEFAULT_AUTONOMY,
          checkInFrequency: "daily",
          status: "idle",
        }).returning();

        if (created) {
          await tx.insert(activityLog).values({
            companyId: ctx.companyId,
            aiEmployeeId: created.id,
            actionType: "employee_hired",
            actionDetail: {
              aiEmployeeId: created.id,
              name: created.name,
              roleTitle: created.roleTitle,
              roleType: created.roleType,
            },
          });
        }

        return created;
      });

      // Seed a high-weight procedural rule from the founder's hiring brief
      // so the very first task this employee runs already reflects the focus.
      if (employee && input.initialFocus && input.initialFocus.trim().length >= 10) {
        const focus = input.initialFocus.trim().slice(0, 800);
        try {
          await seedFounderRule({
            agentId: employee.id,
            tenantId: ctx.companyId,
            ruleType: "style_rule",
            title: `Founder hiring brief`,
            description: focus,
            taskScope: ["all"],
            weight: 2.5,
          });
        } catch (err) {
          console.error("[hire] initialFocus rule seed failed", err);
        }
      }

      return employee!;
    }),

  updateAutonomy: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid(),
      settings: z.record(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(aiEmployees)
        .set({ autonomySettings: input.settings, updatedAt: new Date() })
        .where(and(eq(aiEmployees.id, input.employeeId), eq(aiEmployees.companyId, ctx.companyId)));
    }),

  updateCheckInFrequency: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid(),
      frequency: z.enum(["daily", "weekly", "per_task"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(aiEmployees)
        .set({ checkInFrequency: input.frequency, updatedAt: new Date() })
        .where(and(eq(aiEmployees.id, input.employeeId), eq(aiEmployees.companyId, ctx.companyId)));
    }),

  getActivity: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.activityLog.findMany({
        where: and(
          eq(activityLog.aiEmployeeId, input.employeeId),
          eq(activityLog.companyId, ctx.companyId),
        ),
        limit: input.limit,
        orderBy: (log, { desc }) => [desc(log.createdAt)],
      });
    }),
});
