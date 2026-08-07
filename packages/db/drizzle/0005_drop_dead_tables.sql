-- Dead feature drops: share/referrals, product analytics events, and the
-- departments/functions onboarding layer. Companies mid-onboarding on the
-- removed functions step resume at hiring.
DROP TABLE IF EXISTS "referral_codes";
--> statement-breakpoint
DROP TABLE IF EXISTS "events";
--> statement-breakpoint
DROP TABLE IF EXISTS "functions";
--> statement-breakpoint
DROP TABLE IF EXISTS "departments";
--> statement-breakpoint
ALTER TABLE "deliverables" DROP COLUMN IF EXISTS "share_slug";
--> statement-breakpoint
ALTER TABLE "deliverables" DROP COLUMN IF EXISTS "share_enabled_at";
--> statement-breakpoint
ALTER TABLE "deliverables" DROP COLUMN IF EXISTS "share_snapshot";
--> statement-breakpoint
UPDATE "companies" SET "onboarding_status" = 'hiring' WHERE "onboarding_status" = 'functions';
