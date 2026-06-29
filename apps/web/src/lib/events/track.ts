import { db, events } from "@beast/db";

interface TrackArgs {
  companyId: string;
  userId?: string | null;
  eventName: string;
  properties?: Record<string, unknown>;
}

// Server-side append. Best-effort; never throws into the caller because a
// failing analytics insert must not break a paying user's flow.
export async function trackEvent({
  companyId,
  userId,
  eventName,
  properties,
}: TrackArgs): Promise<void> {
  try {
    await db.insert(events).values({
      companyId,
      userId: userId ?? null,
      eventName,
      properties: properties ?? {},
    });
  } catch (err) {
    console.error("[trackEvent] insert failed", { eventName, companyId, err });
  }
}
