ALTER TABLE "atoms" ADD COLUMN IF NOT EXISTS "explanation" text;--> statement-breakpoint
ALTER TABLE "atoms" ADD COLUMN IF NOT EXISTS "illustration_config" jsonb;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL;
