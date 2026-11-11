ALTER TABLE "attempts" ADD COLUMN "given_answer" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "task_prompt" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "correct_answer" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "extra_domains" jsonb;