import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { trackEvent } from "@/lib/events/track";

// snake_case event names. Listed here so the client and server share a
// single source of truth and analytics joins do not silently drift.
const EVENT_NAMES = [
  "onboarding_started",
  "onboarding_functions",
  "onboarding_hiring",
  "onboarding_complete",
  "onboarding_message_sent",
  "onboarding_chip_shown",
  "onboarding_chip_tapped",
  "onboarding_chip_skipped",
  "dashboard_starter_shown",
  "dashboard_starter_picked",
  "first_task_started",
  "first_deliverable_produced",
  "first_deliverable_approved",
  "deliverable_approved",
  "checkin_answered",
  "autonomy_suggestion_shown",
  "autonomy_suggestion_accepted",
  "autonomy_suggestion_snoozed",
  "autonomy_suggestion_dismissed",
] as const;

const propertiesSchema = z.record(z.string(), z.unknown()).optional();

export const eventsRouter = createTRPCRouter({
  track: protectedProcedure
    .input(
      z.object({
        eventName: z.enum(EVENT_NAMES),
        properties: propertiesSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await trackEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        eventName: input.eventName,
        properties: input.properties,
      });
      return { ok: true };
    }),
});
