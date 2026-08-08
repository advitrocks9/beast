ALTER TABLE "procedural_memories" ADD COLUMN "demo_session_id" uuid REFERENCES "demo_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "episodic_memories" ADD COLUMN "demo_session_id" uuid REFERENCES "demo_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "procedural_memories_demo_session_idx" ON "procedural_memories" ("demo_session_id");
--> statement-breakpoint
CREATE INDEX "episodic_memories_demo_session_idx" ON "episodic_memories" ("demo_session_id");
