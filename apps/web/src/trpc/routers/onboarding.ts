import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { knowledgeItems, companies, departments, functions, goals } from "@beast/db";
import { getClient, getModelId } from "@beast/ai";
import { schedules } from "@trigger.dev/sdk";
import { createTRPCRouter, protectedProcedure } from "../init";
import { trackEvent } from "@/lib/events/track";

const MAX_GOALS_PER_ONBOARDING = 3;
const DEFAULT_GOAL_HORIZON_DAYS = 30;

const CATEGORY_WEIGHTS: Record<string, number> = {
  company_overview: 10,
  products: 20,
  audience: 10,
  brand_voice: 15,
  competitors: 10,
  team: 10,
  processes: 15,
  historical: 10,
};

const ALL_CATEGORIES = Object.keys(CATEGORY_WEIGHTS);

function computeContextScore(filledCategories: Set<string>): number {
  let score = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (filledCategories.has(cat)) score += weight;
  }
  return score;
}

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const SAVE_GOAL_TOOL: Anthropic.Tool = {
  name: "save_goal",
  description: "Save a stated goal the founder wants done in the next ~30 days. Call this for each concrete, action-oriented goal extracted from the user's message. Do not call more than 3 times per onboarding.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Action-oriented goal title, 8-12 words, copy-pasteable. Example: 'Get five qualified leads from a LinkedIn campaign'.",
      },
      target_date: {
        type: "string",
        description: "Target date in YYYY-MM-DD format. If the founder is vague, default to 30 days from today.",
      },
      target_metric: {
        type: "string",
        description: "Optional numeric outcome. Example: '5 leads', '1000 signups', '1 published post'.",
      },
      description: {
        type: "string",
        description: "Optional longer context (max ~3 sentences).",
      },
    },
    required: ["title", "target_date"],
  },
};

// Tool definition for extracting knowledge - lets Claude's natural text be the response
const EXTRACT_KNOWLEDGE_TOOL: Anthropic.Tool = {
  name: "save_knowledge",
  description: "Save extracted company knowledge from the user's message. Call this whenever the user shares information about their company. You can call it multiple times for different categories.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ALL_CATEGORIES,
              description: "The knowledge category. MUST be one of: company_overview, products, audience, brand_voice, competitors, team, processes, historical. Use snake_case exactly.",
            },
            title: {
              type: "string",
              description: "Short descriptive title for this knowledge item",
            },
            content: {
              type: "string",
              description: "The extracted information",
            },
            ai_summary: {
              type: "string",
              description: "One-line summary",
            },
          },
          required: ["category", "title", "content", "ai_summary"],
        },
      },
    },
    required: ["items"],
  },
};

function buildSystemPrompt(
  companyName: string,
  filledCategories: Set<string>,
  unfilled: string[],
  goalsCapturedSoFar: number,
): string {
  const goalsRemaining = MAX_GOALS_PER_ONBOARDING - goalsCapturedSoFar;
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultTargetIso = new Date(Date.now() + DEFAULT_GOAL_HORIZON_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return `You are Beast's onboarding assistant helping a founder set up their AI employee platform.

Have a warm, focused conversation to learn about their company. Ask ONE question at a time.

Categories to cover:
- company_overview: What the company does, mission, market position
- products: Products/services, pricing, differentiators
- audience: Target customers, pain points, buying behavior
- brand_voice: Communication tone, style preferences, what to avoid
- competitors: Key competitors, positioning differences
- team: Team size, key roles, departments
- processes: How work gets done, approval chains, tools used

Company: ${companyName}
Already covered: ${[...filledCategories].join(", ") || "none"}
Still needed: ${unfilled.join(", ") || "all done!"}
Goals captured so far: ${goalsCapturedSoFar} of ${MAX_GOALS_PER_ONBOARDING}

Rules:
1. Respond conversationally in plain text. Never output JSON.
2. Use the save_knowledge tool to extract company information from the user's messages.
3. After acknowledging what they shared, ask about the next unfilled category.
4. Keep responses under 3 sentences. Warm but efficient.
5. When 5+ categories are filled, mention they can continue to the next step.

Goal capture (this is the load-bearing instruction):
6. Once company_overview, products, and team are covered (or after the user has shared 3+ messages of context), ask exactly this:
   "What's one or two specific things you want done in the next 30 days? Marketing, sales, support, or operations, whatever's on your plate. Be concrete. 'Get five qualified leads from a LinkedIn campaign' is better than 'grow the business'."
7. Extract each concrete goal using the save_goal tool. Required: title (8-12 words, action-oriented) and target_date (YYYY-MM-DD).
   - Today is ${todayIso}. If the founder gives a vague timeline ("next month", "soon", "by end of quarter"), default target_date to ${defaultTargetIso}.
   - Optional: target_metric (numeric outcome) and description.
8. Cap at ${MAX_GOALS_PER_ONBOARDING} goals. Goals remaining this session: ${goalsRemaining}. If the founder lists more than ${MAX_GOALS_PER_ONBOARDING}, ask them to pick the top ${MAX_GOALS_PER_ONBOARDING}.
9. After at least 1 goal is captured, you may invite them to continue to the next step.`;
}

export const onboardingRouter = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(z.object({
      messages: z.array(messageSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { name: true, skippedCategories: true },
      });

      // Get already-filled categories
      const existingItems = await ctx.db.query.knowledgeItems.findMany({
        where: eq(knowledgeItems.companyId, ctx.companyId),
        columns: { category: true },
      });
      const filledCategories = new Set(existingItems.map((i) => i.category));
      const skippedSet = new Set(
        Array.isArray(company?.skippedCategories) ? company.skippedCategories : [],
      );
      const unfilled = ALL_CATEGORIES.filter(
        (c) => !filledCategories.has(c) && !skippedSet.has(c),
      );

      const goalCountRow = await ctx.db
        .select({ value: count() })
        .from(goals)
        .where(and(eq(goals.companyId, ctx.companyId), eq(goals.status, "active")));
      const goalsCapturedSoFar = goalCountRow[0]?.value ?? 0;

      const systemPrompt = buildSystemPrompt(
        company?.name ?? "Unknown",
        filledCategories,
        unfilled,
        goalsCapturedSoFar,
      );

      const claudeMessages = input.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const client = getClient();
      const completion = await client.messages.create({
        model: getModelId("sonnet"),
        max_tokens: 1024,
        system: systemPrompt,
        tools: [EXTRACT_KNOWLEDGE_TOOL, SAVE_GOAL_TOOL],
        messages: claudeMessages,
      });

      // Extract tool calls from Claude's response
      let extractedItems: Array<{
        category: string;
        title: string;
        content: string;
        ai_summary: string;
      }> = [];

      const extractedGoals: Array<{
        title: string;
        target_date: string;
        target_metric?: string;
        description?: string;
      }> = [];

      for (const block of completion.content) {
        if (block.type === "tool_use" && block.name === "save_knowledge") {
          const toolInput = block.input as { items: typeof extractedItems };
          if (Array.isArray(toolInput.items)) {
            extractedItems.push(...toolInput.items);
          }
        }
        if (block.type === "tool_use" && block.name === "save_goal") {
          const goalInput = block.input as {
            title?: unknown;
            target_date?: unknown;
            target_metric?: unknown;
            description?: unknown;
          };
          if (typeof goalInput.title === "string" && typeof goalInput.target_date === "string") {
            extractedGoals.push({
              title: goalInput.title,
              target_date: goalInput.target_date,
              target_metric: typeof goalInput.target_metric === "string" ? goalInput.target_metric : undefined,
              description: typeof goalInput.description === "string" ? goalInput.description : undefined,
            });
          }
        }
      }

      // When Claude called tools, send tool results back to get the conversational response
      let aiResponse = "";
      if (completion.stop_reason === "tool_use") {
        const toolResults = completion.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
          .map((b) => ({
            type: "tool_result" as const,
            tool_use_id: b.id,
            content: "Saved successfully.",
          }));

        const followUp = await client.messages.create({
          model: getModelId("sonnet"),
          max_tokens: 512,
          system: systemPrompt,
          tools: [EXTRACT_KNOWLEDGE_TOOL, SAVE_GOAL_TOOL],
          messages: [
            ...claudeMessages,
            { role: "assistant" as const, content: completion.content },
            { role: "user" as const, content: toolResults },
          ],
        });
        for (const block of followUp.content) {
          if (block.type === "text") {
            aiResponse += block.text;
          }
        }
      } else {
        // No tool calls - just grab the text
        for (const block of completion.content) {
          if (block.type === "text") {
            aiResponse += block.text;
          }
        }
      }

      if (!aiResponse.trim()) {
        aiResponse = "Got it! Tell me more about your company.";
      }

      // Pre-compute everything that would land in the DB before opening the
      // transaction so the tx body stays write-only and short.
      const validItems = extractedItems.filter(
        (item) => ALL_CATEGORIES.includes(item.category) && item.content?.trim(),
      );

      let validGoals: Array<{
        companyId: string;
        title: string;
        targetDate: string;
        targetMetric: string | undefined;
        description: string | undefined;
        status: "active";
      }> = [];
      if (extractedGoals.length > 0 && goalsCapturedSoFar < MAX_GOALS_PER_ONBOARDING) {
        const slotsRemaining = MAX_GOALS_PER_ONBOARDING - goalsCapturedSoFar;
        const isoDateOrFallback = (raw: string): string => {
          const trimmed = raw.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
          const parsed = Date.parse(trimmed);
          if (!Number.isNaN(parsed)) {
            return new Date(parsed).toISOString().slice(0, 10);
          }
          return new Date(Date.now() + DEFAULT_GOAL_HORIZON_DAYS * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        };
        validGoals = extractedGoals
          .filter((g) => g.title.trim().length > 0)
          .slice(0, slotsRemaining)
          .map((g) => ({
            companyId: ctx.companyId,
            title: g.title.trim().slice(0, 120),
            targetDate: isoDateOrFallback(g.target_date),
            targetMetric: g.target_metric?.trim().slice(0, 120),
            description: g.description?.trim().slice(0, 1000),
            status: "active" as const,
          }));
      }

      // Atomic so a partial write can't leave knowledge items saved without
      // the contextScore bump that drives the onboarding progress UI, or
      // goals saved without their grounding knowledge items.
      if (validItems.length > 0 || validGoals.length > 0) {
        await ctx.db.transaction(async (tx) => {
          if (validItems.length > 0) {
            await tx.insert(knowledgeItems).values(
              validItems.map((item) => ({
                companyId: ctx.companyId,
                category: item.category,
                title: item.title,
                content: item.content,
                sourceType: "interview" as const,
                aiSummary: item.ai_summary,
              })),
            );

            for (const item of validItems) {
              filledCategories.add(item.category);
            }
            const newScore = computeContextScore(filledCategories);

            await tx
              .update(companies)
              .set({ contextScore: newScore, updatedAt: new Date() })
              .where(eq(companies.id, ctx.companyId));
          }

          if (validGoals.length > 0) {
            await tx.insert(goals).values(validGoals);
          }
        });
      }

      const goalsInsertedThisTurn = validGoals.length;

      const finalScore = computeContextScore(filledCategories);
      const nextUnfilled = ALL_CATEGORIES.find(
        (c) => !filledCategories.has(c) && !skippedSet.has(c),
      ) ?? null;
      return {
        response: aiResponse,
        progress: {
          contextScore: finalScore,
          categories: ALL_CATEGORIES.map((c) => ({
            name: c,
            filled: filledCategories.has(c),
          })),
          totalItems: existingItems.length + extractedItems.length,
          goalsCaptured: goalsCapturedSoFar + goalsInsertedThisTurn,
          goalsCapturedThisTurn: goalsInsertedThisTurn,
          nextUnfilledCategory: nextUnfilled,
        },
      };
    }),

  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const [items, company] = await Promise.all([
      ctx.db.query.knowledgeItems.findMany({
        where: eq(knowledgeItems.companyId, ctx.companyId),
        columns: { category: true },
      }),
      ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { skippedCategories: true },
      }),
    ]);

    const filledCategories = new Set(items.map((i) => i.category));
    const skippedSet = new Set(
      Array.isArray(company?.skippedCategories) ? company.skippedCategories : [],
    );
    const nextUnfilled = ALL_CATEGORIES.find(
      (c) => !filledCategories.has(c) && !skippedSet.has(c),
    ) ?? null;

    return {
      contextScore: computeContextScore(filledCategories),
      categories: ALL_CATEGORIES.map((c) => ({
        name: c,
        filled: filledCategories.has(c),
      })),
      totalItems: items.length,
      nextUnfilledCategory: nextUnfilled,
    };
  }),

  skipCategory: protectedProcedure
    .input(z.object({ category: z.enum(ALL_CATEGORIES as [string, ...string[]]) }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { skippedCategories: true },
      });
      const current = Array.isArray(company?.skippedCategories)
        ? (company.skippedCategories as string[])
        : [];
      if (current.includes(input.category)) {
        return { skipped: current };
      }
      const next = [...current, input.category];
      await ctx.db
        .update(companies)
        .set({ skippedCategories: next, updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));
      return { skipped: next };
    }),

  captureGoal: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(120),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().max(1000).optional(),
      targetMetric: z.string().max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existingRow = await ctx.db
        .select({ value: count() })
        .from(goals)
        .where(and(eq(goals.companyId, ctx.companyId), eq(goals.status, "active")));
      const existing = existingRow[0]?.value ?? 0;
      if (existing >= MAX_GOALS_PER_ONBOARDING) {
        throw new Error(`At most ${MAX_GOALS_PER_ONBOARDING} active goals allowed during onboarding.`);
      }
      const [goal] = await ctx.db.insert(goals).values({
        companyId: ctx.companyId,
        title: input.title.trim(),
        targetDate: input.targetDate,
        description: input.description?.trim(),
        targetMetric: input.targetMetric?.trim(),
        status: "active",
      }).returning({ id: goals.id, title: goals.title });
      return goal;
    }),

  completeInterview: protectedProcedure.mutation(async ({ ctx }) => {
    const goalCountRow = await ctx.db
      .select({ value: count() })
      .from(goals)
      .where(and(eq(goals.companyId, ctx.companyId), eq(goals.status, "active")));
    const goalCount = goalCountRow[0]?.value ?? 0;
    if (goalCount === 0) {
      throw new Error("Capture at least one goal before continuing. Tell the assistant what you want done in the next 30 days.");
    }
    await ctx.db
      .update(companies)
      .set({ onboardingStatus: "functions", updatedAt: new Date() })
      .where(eq(companies.id, ctx.companyId));
    await trackEvent({
      companyId: ctx.companyId,
      userId: ctx.userId,
      eventName: "onboarding_functions",
    });
  }),

  /**
   * Escape hatch: advance to the functions step without requiring an
   * active goal or any knowledge entries. Founders who want defaults
   * and intend to fill /knowledge later get unblocked. Tracked as a
   * separate event so the funnel report can split assisted vs
   * skipped onboarding.
   */
  skipInterview: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(companies)
      .set({ onboardingStatus: "functions", updatedAt: new Date() })
      .where(eq(companies.id, ctx.companyId));
    await trackEvent({
      companyId: ctx.companyId,
      userId: ctx.userId,
      eventName: "onboarding_interview_skipped",
    });
  }),

  saveFunctions: protectedProcedure
    .input(z.object({
      departments: z.array(z.object({
        name: z.string().min(1),
        functions: z.array(z.object({
          name: z.string().min(1),
          mode: z.enum(["ai", "ai_human", "human"]),
        })),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Delete-then-recreate must be atomic. Without the tx, a connection
      // drop after the delete but before the inserts wiped the tenant's
      // entire department/function tree. /onboarding/functions is the
      // only entry point so the founder couldn't recover without DB
      // surgery, and the next saveFunctions retry would hit the empty
      // state and proceed normally, masking the loss.
      await ctx.db.transaction(async (tx) => {
        await tx.delete(departments).where(eq(departments.companyId, ctx.companyId));

        for (const dept of input.departments) {
          const [created] = await tx.insert(departments).values({
            companyId: ctx.companyId,
            name: dept.name,
          }).returning();

          if (created && dept.functions.length > 0) {
            await tx.insert(functions).values(
              dept.functions.map((fn) => ({
                departmentId: created.id,
                companyId: ctx.companyId,
                name: fn.name,
                mode: fn.mode,
              })),
            );
          }
        }

        await tx
          .update(companies)
          .set({ onboardingStatus: "hiring", updatedAt: new Date() })
          .where(eq(companies.id, ctx.companyId));
      });

      await trackEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        eventName: "onboarding_hiring",
        properties: {
          departmentCount: input.departments.length,
          functionCount: input.departments.reduce(
            (acc, d) => acc + d.functions.length,
            0,
          ),
        },
      });
    }),

  completeHiring: protectedProcedure.mutation(async ({ ctx }) => {
    // Fetch company timezone for schedule registration
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
      columns: { timezone: true },
    });

    await ctx.db
      .update(companies)
      .set({ onboardingStatus: "complete", updatedAt: new Date() })
      .where(eq(companies.id, ctx.companyId));
    await trackEvent({
      companyId: ctx.companyId,
      userId: ctx.userId,
      eventName: "onboarding_complete",
    });

    // Register orchestrator schedules for this company
    const tz = company?.timezone ?? "UTC";
    await Promise.all([
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
    ]).catch((err) => {
      // Schedule registration failure should not block onboarding completion
      console.error("[Orchestrator] Failed to register schedules:", err);
    });
  }),
});
