import type {
  EmployeeRole,
  TaskStatus,
  DeliverableType,
  KnowledgeCategory,
  OnboardingStatus,
} from "./constants";

export interface Company {
  id: string;
  clerkOrgId: string;
  name: string;
  websiteUrl: string | null;
  industry: string | null;
  companySize: string | null;
  contextScore: number;
  onboardingStatus: OnboardingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIEmployee {
  id: string;
  companyId: string;
  name: string;
  roleTitle: string;
  roleType: EmployeeRole;
  personality: {
    communicationStyle: string;
    traits: string[];
    voiceDescription: string;
  };
  status: "idle" | "working" | "waiting_review" | "check_in";
  currentTaskId: string | null;
  autonomySettings: Record<string, string>;
  checkInFrequency: "daily" | "weekly" | "per_task";
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  companyId: string;
  aiEmployeeId: string;
  goalId: string | null;
  parentTaskId: string | null;
  title: string;
  brief: Record<string, unknown>;
  taskType: string;
  origin: "user_created" | "proactive" | "recurring" | "collaboration";
  status: TaskStatus;
  plan: Record<string, unknown> | null;
  planApproved: boolean;
  triggerRunId: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface Deliverable {
  id: string;
  taskId: string;
  companyId: string;
  aiEmployeeId: string;
  deliverableType: DeliverableType;
  title: string;
  content: Record<string, unknown>;
  version: number;
  status: "draft" | "review" | "revision" | "approved" | "published";
  publishedUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeItem {
  id: string;
  companyId: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  sourceType: "interview" | "document" | "url_crawl" | "feedback_learned";
  aiSummary: string | null;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
