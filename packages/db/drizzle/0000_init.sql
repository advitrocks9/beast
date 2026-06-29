CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ai_employee_id" uuid,
	"action_type" text NOT NULL,
	"action_detail" jsonb NOT NULL,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomy_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ai_employee_id" uuid NOT NULL,
	"action" text NOT NULL,
	"consecutive_approvals" integer NOT NULL,
	"message" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"shown_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"snooze_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ai_employee_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_employee_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"check_in_type" text NOT NULL,
	"content" jsonb NOT NULL,
	"task_id" uuid,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"response" text,
	"scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaboration_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_employee_id" uuid NOT NULL,
	"to_employee_id" uuid NOT NULL,
	"source_deliverable_id" uuid,
	"proposal" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resulting_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website_url" text,
	"industry" text,
	"company_size" text,
	"context_score" integer DEFAULT 0,
	"onboarding_status" text DEFAULT 'started' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb,
	"skipped_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"founder_email" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"billing_tier" text DEFAULT 'trial' NOT NULL,
	"billing_status" text DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"weekly_empty_state_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"access_token_enc" "bytea" NOT NULL,
	"refresh_token_enc" "bytea",
	"token_expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "functions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'ai' NOT NULL,
	"ai_employee_id" uuid,
	"human_owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role_title" text NOT NULL,
	"role_type" text NOT NULL,
	"personality" jsonb NOT NULL,
	"system_prompt" text NOT NULL,
	"memory_summary" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"current_task_id" uuid,
	"autonomy_settings" jsonb DEFAULT '{}'::jsonb,
	"check_in_frequency" text DEFAULT 'daily' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_employee_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"memory_type" text NOT NULL,
	"content" text NOT NULL,
	"source_task_id" uuid,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"event_name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_goal_id" uuid,
	"ai_employee_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"target_metric" text,
	"target_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source_type" text NOT NULL,
	"source_file_id" uuid,
	"ai_summary" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"r2_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"page_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"ai_employee_id" uuid NOT NULL,
	"deliverable_type" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"rendered_preview" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_url" text,
	"published_at" timestamp with time zone,
	"share_slug" text,
	"share_enabled_at" timestamp with time zone,
	"share_snapshot" jsonb,
	"approval_rationale" text,
	"approved_at" timestamp with time zone,
	"publish_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ai_employee_id" uuid NOT NULL,
	"goal_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"brief" jsonb NOT NULL,
	"task_type" text NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"plan" jsonb,
	"plan_approved" boolean DEFAULT false NOT NULL,
	"trigger_run_id" text,
	"recurrence" jsonb,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"anchor_from" integer NOT NULL,
	"anchor_to" integer NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"comment_type" text DEFAULT 'text' NOT NULL,
	"chip_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodic_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"episode_type" text NOT NULL,
	"summary" text NOT NULL,
	"content" jsonb NOT NULL,
	"embedding" vector(1536),
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" uuid,
	"session_id" uuid,
	"salience_score" real DEFAULT 0.5 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"consolidated_into" uuid,
	"is_consolidated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedural_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"task_scope" text[],
	"title" text NOT NULL,
	"description" text NOT NULL,
	"examples" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"source_episodes" uuid[],
	"signal_count" integer DEFAULT 1 NOT NULL,
	"signal_weight" real DEFAULT 1 NOT NULL,
	"tasks_applied_to" integer DEFAULT 0 NOT NULL,
	"approval_rate_delta" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deprecated_at" timestamp with time zone,
	"deprecated_reason" text,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "rule_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"task_scope" text[],
	"title" text NOT NULL,
	"description" text NOT NULL,
	"signal_count" integer DEFAULT 1 NOT NULL,
	"signal_weight" real DEFAULT 0 NOT NULL,
	"source_episodes" uuid[],
	"promoted_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semantic_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scope" text DEFAULT 'shared' NOT NULL,
	"agent_id" uuid,
	"fact" text NOT NULL,
	"context" text,
	"category" text NOT NULL,
	"embedding" vector(1536),
	"entity_name" text,
	"entity_type" text,
	"related_to" uuid[],
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"superseded_by" uuid,
	"confidence" real DEFAULT 1 NOT NULL,
	"source" text,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"relevance_score" integer,
	"routed_to_employee_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"source_deliverable_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_by_company_id" uuid,
	"redeemed_at" timestamp with time zone,
	"reward_granted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_suggestions" ADD CONSTRAINT "autonomy_suggestions_ai_employee_id_ai_employees_id_fk" FOREIGN KEY ("ai_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_ai_employee_id_ai_employees_id_fk" FOREIGN KEY ("ai_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_ai_employee_id_ai_employees_id_fk" FOREIGN KEY ("ai_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_proposals" ADD CONSTRAINT "collaboration_proposals_from_employee_id_ai_employees_id_fk" FOREIGN KEY ("from_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_proposals" ADD CONSTRAINT "collaboration_proposals_to_employee_id_ai_employees_id_fk" FOREIGN KEY ("to_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_proposals" ADD CONSTRAINT "collaboration_proposals_source_deliverable_id_deliverables_id_fk" FOREIGN KEY ("source_deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_proposals" ADD CONSTRAINT "collaboration_proposals_resulting_task_id_tasks_id_fk" FOREIGN KEY ("resulting_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_employees" ADD CONSTRAINT "ai_employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_memories" ADD CONSTRAINT "employee_memories_ai_employee_id_ai_employees_id_fk" FOREIGN KEY ("ai_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_goal_id_goals_id_fk" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_ai_employee_id_ai_employees_id_fk" FOREIGN KEY ("ai_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ai_employee_id_ai_employees_id_fk" FOREIGN KEY ("ai_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_thread_id_comment_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodic_memories" ADD CONSTRAINT "episodic_memories_agent_id_ai_employees_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodic_memories" ADD CONSTRAINT "episodic_memories_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodic_memories" ADD CONSTRAINT "episodic_memories_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodic_memories" ADD CONSTRAINT "episodic_memories_consolidated_into_procedural_memories_id_fk" FOREIGN KEY ("consolidated_into") REFERENCES "public"."procedural_memories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedural_memories" ADD CONSTRAINT "procedural_memories_agent_id_ai_employees_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedural_memories" ADD CONSTRAINT "procedural_memories_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedural_memories" ADD CONSTRAINT "procedural_memories_parent_id_procedural_memories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."procedural_memories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_agent_id_ai_employees_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_agent_id_ai_employees_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_superseded_by_semantic_memories_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."semantic_memories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_routed_to_employee_id_ai_employees_id_fk" FOREIGN KEY ("routed_to_employee_id") REFERENCES "public"."ai_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_source_deliverable_id_deliverables_id_fk" FOREIGN KEY ("source_deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_redeemed_by_company_id_companies_id_fk" FOREIGN KEY ("redeemed_by_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_events_task_time_idx" ON "agent_run_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "autonomy_suggestions_company_state_idx" ON "autonomy_suggestions" USING btree ("company_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "autonomy_suggestions_active_unique" ON "autonomy_suggestions" USING btree ("company_id","ai_employee_id","action") WHERE state IN ('queued','shown','snoozed');--> statement-breakpoint
CREATE INDEX "chat_messages_company_employee_time_idx" ON "chat_messages" USING btree ("company_id","ai_employee_id","created_at");--> statement-breakpoint
CREATE INDEX "check_ins_company_unack_scheduled_idx" ON "check_ins" USING btree ("company_id","scheduled_for") WHERE "check_ins"."acknowledged" = false;--> statement-breakpoint
CREATE INDEX "idx_employee_memories_vector" ON "employee_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "events_company_event_time_idx" ON "events" USING btree ("company_id","event_name","created_at");--> statement-breakpoint
CREATE INDEX "events_event_time_idx" ON "events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "idx_knowledge_embeddings_vector" ON "knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_episodic_memories_vector" ON "episodic_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_episodic_memories_agent_time" ON "episodic_memories" USING btree ("agent_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_episodic_memories_tenant_type" ON "episodic_memories" USING btree ("tenant_id","episode_type","is_consolidated");--> statement-breakpoint
CREATE INDEX "idx_procedural_memories_agent_current" ON "procedural_memories" USING btree ("agent_id","is_current","task_scope");--> statement-breakpoint
CREATE INDEX "idx_procedural_memories_vector" ON "procedural_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_semantic_memories_vector" ON "semantic_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_semantic_memories_tenant_category" ON "semantic_memories" USING btree ("tenant_id","category","valid_until");--> statement-breakpoint
CREATE INDEX "referral_codes_company_idx" ON "referral_codes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "referral_codes_redeemed_idx" ON "referral_codes" USING btree ("redeemed_by_company_id") WHERE "referral_codes"."redeemed_by_company_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_reads_unique" ON "notification_reads" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "notification_reads_user_company_idx" ON "notification_reads" USING btree ("user_id","company_id");