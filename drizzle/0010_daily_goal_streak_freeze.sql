ALTER TABLE "gamification_state" ADD COLUMN IF NOT EXISTS "streak_freezes" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gamification_state" ADD COLUMN IF NOT EXISTS "daily_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gamification_state" ADD COLUMN IF NOT EXISTS "daily_xp_date" text;
