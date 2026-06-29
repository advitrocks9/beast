import { db, tasks, aiEmployees, companies, activityLog } from "@beast/db";
import { eq, and, isNotNull, ne, lte } from "drizzle-orm";
import type { TickContext, RecurrenceConfig } from "./types";
import type { SpawnPayload } from "../chains/advance";

interface RecurringResult {
  spawned: Array<{ taskId: string; payload: SpawnPayload }>;
  errors: string[];
}

/**
 * Check all recurring task templates for a company.
 * Spawn new instances for any that are due.
 */
export async function processRecurringTasks(ctx: TickContext): Promise<RecurringResult> {
  const result: RecurringResult = { spawned: [], errors: [] };

  // Fetch recurring task templates (rows with recurrence config that aren't cancelled)
  const templates = await db.query.tasks.findMany({
    where: and(
      eq(tasks.companyId, ctx.companyId),
      isNotNull(tasks.recurrence),
      ne(tasks.status, "cancelled"),
    ),
  });

  for (const template of templates) {
    try {
      const config = template.recurrence as unknown as RecurrenceConfig;
      if (!config?.nextOccurrenceAt) continue;

      if (!isRecurrenceDue(config, ctx.now)) continue;

      // Resolve employee info for spawn payload
      const employee = await db.query.aiEmployees.findFirst({
        where: eq(aiEmployees.id, template.aiEmployeeId),
        columns: { id: true, name: true, roleType: true },
      });

      const company = await db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { name: true },
      });

      if (!employee || !company) {
        result.errors.push(`Template ${template.id}: employee or company not found`);
        continue;
      }

      const brief = template.brief as Record<string, unknown>;

      // Advance the template's nextOccurrenceAt at the same time as the
      // instance insert. Without this tx, a partial commit leaves an
      // instance row created with the template still pointing at the
      // old (already-due) nextOccurrenceAt; the next 5-min tick sees
      // the template still due and spawns a SECOND instance for the
      // same scheduled time. The orchestrator-tick wrapper's optimistic
      // claim doesn't catch this because the duplicate is at
      // the INSTANCE level, not the trigger level: two distinct rows
      // get claimed and triggered.
      const nextConfig: RecurrenceConfig = {
        ...config,
        lastOccurrenceAt: config.nextOccurrenceAt,
        nextOccurrenceAt: computeNextOccurrence(config),
      };

      const instance = await db.transaction(async (tx) => {
        const [created] = await tx.insert(tasks).values({
          companyId: ctx.companyId,
          aiEmployeeId: template.aiEmployeeId,
          parentTaskId: template.id,
          title: template.title,
          brief,
          taskType: template.taskType,
          origin: "recurring",
          scheduledAt: new Date(config.nextOccurrenceAt),
        }).returning();

        if (!created) return null;

        await tx.update(tasks).set({
          recurrence: nextConfig as unknown as Record<string, unknown>,
        }).where(eq(tasks.id, template.id));

        await tx.insert(activityLog).values({
          companyId: ctx.companyId,
          aiEmployeeId: template.aiEmployeeId,
          actionType: "recurring_task_spawned",
          actionDetail: {
            templateId: template.id,
            instanceId: created.id,
            taskType: template.taskType,
          },
        });

        return created;
      });

      if (!instance) {
        result.errors.push(`Template ${template.id}: failed to create instance`);
        continue;
      }

      // Build spawn payload (Trigger.dev wrapper will dispatch)
      const objective = (brief as Record<string, string>).objective ?? template.title;
      result.spawned.push({
        taskId: instance.id,
        payload: {
          agentId: employee.id,
          tenantId: ctx.companyId,
          agentName: employee.name,
          roleType: employee.roleType,
          companyName: company.name,
          task: {
            taskId: instance.id,
            title: template.title,
            objective,
            taskType: template.taskType,
            brief,
          },
        },
      });
    } catch (err) {
      result.errors.push(`Template ${template.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/** Check if a recurring task is due based on its nextOccurrenceAt. */
export function isRecurrenceDue(config: RecurrenceConfig, now: Date): boolean {
  const next = new Date(config.nextOccurrenceAt);
  return now >= next;
}

/**
 * Convert a local date/time in a timezone to a UTC Date.
 * Uses Intl.DateTimeFormat to get the timezone offset.
 */
function localToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  // Create a date string that represents the local time
  // Use a reference UTC date, then compute the offset for the target timezone
  const localStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

  // Parse as if UTC, then adjust by the timezone offset
  const asUtc = new Date(localStr + "Z");

  // Get what time it is in the target TZ when it's this time in UTC
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hour12: false,
  });

  // Compute offset: the difference between UTC and local at this point
  const utcParts = extractDateParts(formatter.formatToParts(asUtc));
  const offsetMs = asUtc.getTime() - new Date(
    `${utcParts.year}-${String(utcParts.month).padStart(2, "0")}-${String(utcParts.day).padStart(2, "0")}T${String(utcParts.hour).padStart(2, "0")}:${String(utcParts.minute).padStart(2, "0")}:00Z`
  ).getTime();

  // Apply offset: local time + offset = UTC time
  return new Date(asUtc.getTime() + offsetMs);
}

function extractDateParts(parts: Intl.DateTimeFormatPart[]): { year: number; month: number; day: number; hour: number; minute: number } {
  let year = 0, month = 0, day = 0, hour = 0, minute = 0;
  for (const part of parts) {
    switch (part.type) {
      case "year": year = parseInt(part.value); break;
      case "month": month = parseInt(part.value); break;
      case "day": day = parseInt(part.value); break;
      case "hour": hour = parseInt(part.value); break;
      case "minute": minute = parseInt(part.value); break;
    }
  }
  return { year, month, day, hour, minute };
}

/**
 * Compute the first occurrence from "now" for a new recurring task.
 * Finds the next valid date/time in the company's timezone.
 */
export function computeFirstOccurrence(config: Omit<RecurrenceConfig, "nextOccurrenceAt" | "lastOccurrenceAt">, now: Date): string {
  const tz = config.timezone || "UTC";

  // Get "now" in the company's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hour12: false,
  });
  const nowLocal = extractDateParts(formatter.formatToParts(now));

  let targetYear = nowLocal.year;
  let targetMonth = nowLocal.month - 1; // 0-indexed
  let targetDay = nowLocal.day;

  switch (config.frequency) {
    case "daily": {
      // If today's time has already passed, schedule for tomorrow
      if (nowLocal.hour > config.hour || (nowLocal.hour === config.hour && nowLocal.minute >= config.minute)) {
        targetDay += 1;
      }
      break;
    }
    case "weekly": {
      const targetDow = config.dayOfWeek ?? 1; // Default Monday
      // Get current day of week in local timezone
      const nowDate = new Date(now);
      const localDowFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const currentDowStr = localDowFormatter.format(nowDate);
      const currentDow = dayNames.indexOf(currentDowStr);

      let daysUntil = (targetDow - currentDow + 7) % 7;
      // If it's today but time has passed, push to next week
      if (daysUntil === 0 && (nowLocal.hour > config.hour || (nowLocal.hour === config.hour && nowLocal.minute >= config.minute))) {
        daysUntil = 7;
      }
      targetDay += daysUntil;
      break;
    }
    case "monthly": {
      const dom = config.dayOfMonth ?? 1;
      targetDay = dom;
      // If this month's day has passed, go to next month
      if (nowLocal.day > dom || (nowLocal.day === dom && (nowLocal.hour > config.hour || (nowLocal.hour === config.hour && nowLocal.minute >= config.minute)))) {
        targetMonth += 1;
      }
      // Handle month overflow
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
      // Clamp to last day of target month
      const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      targetDay = Math.min(dom, lastDay);
      break;
    }
  }

  // Normalize day overflow (e.g., Jan 32 → Feb 1)
  const normalized = new Date(targetYear, targetMonth, targetDay);

  return localToUtc(
    normalized.getFullYear(),
    normalized.getMonth(),
    normalized.getDate(),
    config.hour,
    config.minute,
    tz,
  ).toISOString();
}

/**
 * Compute the next occurrence after the current nextOccurrenceAt.
 * Advances by the recurrence interval, sets correct hour/minute in timezone.
 */
export function computeNextOccurrence(config: RecurrenceConfig): string {
  const tz = config.timezone || "UTC";
  const current = new Date(config.nextOccurrenceAt);

  // Get the current occurrence's date in local timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
  });
  const local = extractDateParts(formatter.formatToParts(current));

  let targetYear = local.year;
  let targetMonth = local.month - 1; // 0-indexed
  let targetDay = local.day;

  switch (config.frequency) {
    case "daily": {
      targetDay += 1;
      break;
    }
    case "weekly": {
      targetDay += 7;
      break;
    }
    case "monthly": {
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
      // Clamp day to last day of target month
      if (config.dayOfMonth) {
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        targetDay = Math.min(config.dayOfMonth, lastDay);
      }
      break;
    }
  }

  // Normalize day overflow
  const normalized = new Date(targetYear, targetMonth, targetDay);

  return localToUtc(
    normalized.getFullYear(),
    normalized.getMonth(),
    normalized.getDate(),
    config.hour,
    config.minute,
    tz,
  ).toISOString();
}
