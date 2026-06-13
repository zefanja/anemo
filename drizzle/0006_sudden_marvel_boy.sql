ALTER TYPE "public"."badge_type" ADD VALUE 'streak_3' BEFORE 'streak_7';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'streak_100' BEFORE 'atoms_10';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'atoms_5' BEFORE 'atoms_10';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'atoms_25' BEFORE 'atoms_50';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'xp_100';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'xp_500';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'xp_1500';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'xp_4000';--> statement-breakpoint
ALTER TYPE "public"."badge_type" ADD VALUE 'xp_8000';--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "show_leaderboard" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "students_code_hash_idx" ON "students" USING btree ("code_hash");