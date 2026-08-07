export const EMPLOYEE_ROLES = ["marketing", "sales", "support"] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const TASK_STATUSES = [
  "queued",
  "planning",
  "plan_review",
  "running",
  "in_review",
  "revising",
  "accepted",
  "published",
  "failed",
  "timed_out",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const DELIVERABLE_STATUSES = ["in_review", "accepted", "revised", "published"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const DELIVERABLE_TYPES = [
  "blog",
  "email",
  "social_twitter",
  "social_linkedin",
  "faq",
  "report",
  "proposal",
  "custom",
] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

export const TASK_ORIGINS = [
  "user_created",
  "proactive",
  "recurring",
  "collaboration",
  "chain_step",
] as const;
export type TaskOrigin = (typeof TASK_ORIGINS)[number];

export const EMPLOYEE_STATUSES = ["idle", "working", "waiting_review", "check_in"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const CHECK_IN_TYPES = ["daily_summary", "weekly_report", "task_complete", "status_update"] as const;
export type CheckInType = (typeof CHECK_IN_TYPES)[number];

export const CHECK_IN_FREQUENCIES = ["daily", "weekly", "per_task"] as const;
export type CheckInFrequency = (typeof CHECK_IN_FREQUENCIES)[number];

export const KNOWLEDGE_CATEGORIES = [
  "company_overview",
  "products",
  "audience",
  "brand_voice",
  "competitors",
  "team",
  "processes",
  "historical_outputs",
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const ONBOARDING_STATUSES = [
  "started",
  "interview",
  "hiring",
  "complete",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const BILLING_TIERS = ["trial", "starter", "team", "business"] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

export const PAID_TIERS = ["starter", "team", "business"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

// trial mirrors team so the full loop is evaluable before checkout.
export const TIER_LIMITS: Record<BillingTier, { tasksPerMonth: number; employees: number }> = {
  trial: { tasksPerMonth: 200, employees: 3 },
  starter: { tasksPerMonth: 50, employees: 1 },
  team: { tasksPerMonth: 200, employees: 3 },
  business: { tasksPerMonth: 500, employees: 6 },
};
