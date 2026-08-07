-- Contract task/deliverable states. Tasks: queued, planning, plan_review,
-- running, in_review, revising, accepted, published, failed, timed_out,
-- cancelled (user-initiated only). Deliverables: in_review, accepted,
-- revised, published. Idempotent: old values simply stop matching.
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'queued';
--> statement-breakpoint
ALTER TABLE "deliverables" ALTER COLUMN "status" SET DEFAULT 'in_review';
--> statement-breakpoint
UPDATE "tasks" SET "status" = 'queued' WHERE "status" = 'pending';
--> statement-breakpoint
UPDATE "tasks" SET "status" = 'plan_review' WHERE "status" = 'planned';
--> statement-breakpoint
UPDATE "tasks" SET "status" = 'running' WHERE "status" IN ('working', 'in_progress');
--> statement-breakpoint
UPDATE "tasks" SET "status" = 'in_review' WHERE "status" = 'review';
--> statement-breakpoint
UPDATE "tasks" SET "status" = 'revising' WHERE "status" = 'revision';
--> statement-breakpoint
UPDATE "tasks" SET "status" = 'accepted' WHERE "status" IN ('approved', 'completed');
--> statement-breakpoint
UPDATE "deliverables" SET "status" = 'in_review' WHERE "status" IN ('draft', 'pending_review', 'review');
--> statement-breakpoint
UPDATE "deliverables" SET "status" = 'revised' WHERE "status" = 'revision';
--> statement-breakpoint
UPDATE "deliverables" SET "status" = 'accepted' WHERE "status" = 'approved';
