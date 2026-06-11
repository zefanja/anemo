ALTER TABLE "student_atom_status" ADD COLUMN "placement_source" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "placement_done" boolean DEFAULT false NOT NULL;