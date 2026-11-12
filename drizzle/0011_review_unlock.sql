ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "review_unlock_daily" integer;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "review_unlock_percent" integer;
