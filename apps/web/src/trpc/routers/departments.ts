import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { departments, functions } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

export const departmentsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.departments.findMany({
      where: eq(departments.companyId, ctx.companyId),
    });
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      functions: z.array(z.object({
        name: z.string(),
        mode: z.enum(["ai", "ai_human", "human"]).default("ai"),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Atomic so a partial commit can't leave an empty department on
      // /onboarding/functions or /settings with no functions attached.
      // Same shape as employees.hire (row 109) and onboarding.saveFunctions
      // (row 110).
      const dept = await ctx.db.transaction(async (tx) => {
        const [created] = await tx.insert(departments).values({
          companyId: ctx.companyId,
          name: input.name,
        }).returning();

        if (!created) throw new Error("Failed to create department");

        if (input.functions.length > 0) {
          await tx.insert(functions).values(
            input.functions.map((fn) => ({
              departmentId: created.id,
              companyId: ctx.companyId,
              name: fn.name,
              mode: fn.mode,
            })),
          );
        }

        return created;
      });

      return dept;
    }),

  updateFunctionMode: protectedProcedure
    .input(z.object({
      functionId: z.string().uuid(),
      mode: z.enum(["ai", "ai_human", "human"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(functions)
        .set({ mode: input.mode })
        .where(and(eq(functions.id, input.functionId), eq(functions.companyId, ctx.companyId)));
    }),
});
