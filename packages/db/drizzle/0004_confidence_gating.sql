-- Confidence-gated learning. Candidates carry stored confidence = 1 - exp(-signal_weight / 2)
-- and a distinct-review counter; promoted rules keep the confidence they promoted at.
ALTER TABLE "rule_candidates" ADD COLUMN "confidence" real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD COLUMN "distinct_review_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD COLUMN "source_review_ids" uuid[];
--> statement-breakpoint
UPDATE "rule_candidates" SET "confidence" = 1 - exp(-"signal_weight" / 2.0), "distinct_review_count" = "signal_count";
--> statement-breakpoint
ALTER TABLE "procedural_memories" ADD COLUMN "confidence" real DEFAULT 0.5 NOT NULL;
--> statement-breakpoint
UPDATE "procedural_memories" SET "confidence" = 1 - exp(-"signal_weight" / 2.0);
