import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, isNotNull } from "drizzle-orm";
import { deliverables, aiEmployees } from "@beast/db";
import { createTRPCRouter, publicProcedure } from "../init";
import { scrubPII } from "@/lib/share/scrub";

/**
 * Public read-only router for /share/[slug]. NO companyId scoping.
 * Returns the deliverable's content with a PII-scrub pass and the
 * authoring employee's name + role color so the public page can
 * render "Made by Alex on Beast" without leaking company-specific info.
 */
export const shareRouter = createTRPCRouter({
  get: publicProcedure
    .input(z.object({ slug: z.string().min(8).max(20) }))
    .query(async ({ ctx, input }) => {
      const deliverable = await ctx.db.query.deliverables.findFirst({
        where: and(
          eq(deliverables.shareSlug, input.slug),
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
      if (!deliverable) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found" });
      }

      const employee = await ctx.db.query.aiEmployees.findFirst({
        where: eq(aiEmployees.id, deliverable.aiEmployeeId),
        columns: { name: true, roleType: true },
      });

      // Prefer the share-time snapshot so edits after share don't bleed into
      // the public URL. Falls back to live content for legacy shares minted
      // (when shareSnapshot was added).
      const sourceContent = (deliverable.shareSnapshot ?? deliverable.content) as Record<string, unknown>;

      return {
        title: deliverable.title,
        deliverableType: deliverable.deliverableType,
        content: scrubPII(sourceContent),
        sharedAt: deliverable.shareEnabledAt,
        employeeName: employee?.name ?? "Beast",
        employeeRoleType: employee?.roleType ?? "marketing",
      };
    }),
});
