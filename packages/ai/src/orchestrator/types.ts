import type { SpawnPayload } from "../chains/advance";

/** Recurrence configuration stored in tasks.recurrence JSONB. */
export interface RecurrenceConfig {
  frequency: "daily" | "weekly" | "monthly";
  /** 0=Sun..6=Sat, for weekly recurrence */
  dayOfWeek?: number;
  /** 1-31, for monthly recurrence */
  dayOfMonth?: number;
  /** 0-23, hour in company timezone */
  hour: number;
  /** 0-59 */
  minute: number;
  /** IANA timezone string */
  timezone: string;
  /** ISO 8601 UTC timestamp of next scheduled run */
  nextOccurrenceAt: string;
  /** ISO 8601 UTC timestamp of last completed run */
  lastOccurrenceAt?: string;
}

/** Context for a single orchestrator tick. */
export interface TickContext {
  companyId: string;
  timezone: string;
  now: Date;
}

/** Result of a tick - stats for logging. */
export interface TickResult {
  companyId: string;
  recurringTasksSpawned: number;
  statusUpdates: number;
  checkInsDispatched: number;
  signalsProcessed: number;
  signalsRouted: number;
  errors: string[];
}

/** Dispatch instructions returned by runTick for the Trigger.dev wrapper to execute. */
export interface TickDispatch {
  tasksToSpawn: Array<{
    taskId: string;
    payload: SpawnPayload;
  }>;
  checkInsToDispatch: Array<{
    employeeId: string;
    companyId: string;
    checkInType: "daily_summary" | "weekly_report";
  }>;
}

/** Structured check-in content stored in check_ins.content JSONB. */
export interface CheckInContent {
  headline: string;
  summary: string;
  completedTasks: Array<{ taskId: string; title: string; status: string }>;
  highlights: string[];
  suggestedActions: string[];
}

/** Pre-execution check-in content - plan for a complex task. */
export interface PreExecutionCheckIn {
  headline: string;
  approach: string;
  steps: string[];
  questionsForFounder: string[];
  estimatedComplexity: "simple" | "moderate" | "complex";
}

/** Status determination result. */
export interface StatusDetermination {
  employeeId: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}
