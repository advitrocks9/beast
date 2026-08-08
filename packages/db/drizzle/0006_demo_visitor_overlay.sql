-- Demo visitor overlay: one demo_sessions row per visitor cookie, a daily
-- global budget ledger, and a nullable demo_session_id on every table a
-- visitor can write so their rows layer over the shared seed. Deliverable
-- edits copy-on-write via supersedes_deliverable_id. comment_threads and
-- comments lost their only code path when the annotations router was deleted.
CREATE TABLE "demo_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_hash" text NOT NULL,
  "runs_used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "demo_sessions_ip_hash_created_idx" ON "demo_sessions" ("ip_hash", "created_at");
--> statement-breakpoint
CREATE TABLE "demo_budget" (
  "day" date PRIMARY KEY NOT NULL,
  "tokens_used" bigint DEFAULT 0 NOT NULL,
  "runs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "demo_session_id" uuid REFERENCES "demo_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "tasks_demo_session_idx" ON "tasks" ("demo_session_id");
--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "demo_session_id" uuid REFERENCES "demo_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "deliverables_demo_session_idx" ON "deliverables" ("demo_session_id");
--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "supersedes_deliverable_id" uuid REFERENCES "deliverables"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD COLUMN "demo_session_id" uuid REFERENCES "demo_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "rule_candidates_demo_session_idx" ON "rule_candidates" ("demo_session_id");
--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "demo_session_id" uuid REFERENCES "demo_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "activity_log_demo_session_idx" ON "activity_log" ("demo_session_id");
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "demo_session_id" uuid REFERENCES "demo_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "chat_messages_demo_session_idx" ON "chat_messages" ("demo_session_id");
--> statement-breakpoint
DROP TABLE IF EXISTS "comments";
--> statement-breakpoint
DROP TABLE IF EXISTS "comment_threads";
