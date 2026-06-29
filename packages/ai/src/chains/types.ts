import type { EmployeeRole } from "@beast/shared";

/** A single step in a multi-step task chain plan. */
export interface PlanStep {
  /** Unique step identifier within the plan */
  stepId: string;
  /** Human-readable step name */
  name: string;
  /** The task type / skill ID this step maps to */
  taskType: string;
  /** Which AI employee role should execute this step */
  assignedRole: EmployeeRole;
  /** Specific aiEmployeeId for cross-employee chains */
  assignedEmployeeId?: string;
  /** Brief/instructions for this step's task */
  brief: Record<string, unknown>;
  /** Whether founder must approve this step's deliverable before next step starts */
  humanGate: boolean;
  /** IDs of steps this step depends on (V1: sequential - always [previousStepId]) */
  dependsOn: string[];
}

/** The full plan stored in parent task's `plan` JSONB column. */
export interface TaskPlan {
  /** Schema version for forward compatibility */
  version: 1;
  /** Original user objective */
  objective: string;
  /** Ordered list of steps */
  steps: PlanStep[];
  /** stepId → childTaskId once spawned */
  stepTaskMap: Record<string, string>;
  /** stepId → deliverableId once created */
  stepDeliverableMap: Record<string, string>;
}

/** Result of advanceChain: what action was taken. */
export interface AdvanceResult {
  action:
    | "spawned_next"
    | "chain_complete"
    | "waiting_gate"
    | "already_running"
    | "chain_failed"
    | "no_plan";
  stepId?: string;
  childTaskId?: string;
  error?: string;
}

/** Result of classifyTask: whether the task needs multi-step execution. */
export interface ClassificationResult {
  isMultiStep: boolean;
  reasoning: string;
}

/** Maps taskType → deliverableType for auto-creation. */
export const TASK_TYPE_TO_DELIVERABLE_TYPE: Record<string, string> = {
  "write-blog-post": "blog",
  "create-social-post": "social_twitter",
  "draft-newsletter": "email",
  "draft-outreach-email": "email",
  "create-email-sequence": "email",
  "draft-ticket-response": "custom",
  "write-faq-article": "faq",
  "custom": "custom",
};
