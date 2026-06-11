CREATE TYPE "public"."answer_type" AS ENUM('number', 'fraction', 'integer', 'text');--> statement-breakpoint
CREATE TYPE "public"."atom_level" AS ENUM('atom', 'cluster');--> statement-breakpoint
CREATE TYPE "public"."badge_type" AS ENUM('first_atom', 'cluster_complete', 'streak_7', 'streak_30', 'atoms_10', 'atoms_50', 'atoms_all');--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('required', 'helpful', 'deepens');--> statement-breakpoint
CREATE TABLE "atoms" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"domain" text NOT NULL,
	"subdomain" text,
	"level" "atom_level" NOT NULL,
	"granularity" integer,
	"schulformen" jsonb,
	"jahrgangsstufen" jsonb,
	"mastery_required" real DEFAULT 0.8 NOT NULL,
	"curriculum_centrality" real DEFAULT 0.5 NOT NULL,
	"transfer_value" real DEFAULT 0.5 NOT NULL,
	"cognitive_load" real DEFAULT 0.5 NOT NULL,
	"lehrplan_ref" jsonb,
	"related" jsonb,
	"tags" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"atom_id" text NOT NULL,
	"task_id" text,
	"is_correct" boolean NOT NULL,
	"fsrs_rating" integer,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"student_id" text NOT NULL,
	"badge_type" "badge_type" NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_student_id_badge_type_pk" PRIMARY KEY("student_id","badge_type")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text,
	"teacher_id" text,
	"name" text NOT NULL,
	"enabled_domains" jsonb,
	"session_max_total" integer,
	"session_max_review" integer,
	"cognitive_weight" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"edge_type" "edge_type" NOT NULL,
	"mastery_level_needed" real DEFAULT 0.8 NOT NULL,
	"note" text,
	CONSTRAINT "edges_source_id_target_id_pk" PRIMARY KEY("source_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_state" (
	"student_id" text PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"streak_last_date" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"identifier" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_attempts_identifier_pk" PRIMARY KEY("identifier")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text,
	"teacher_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_atom_status" (
	"student_id" text NOT NULL,
	"atom_id" text NOT NULL,
	"mastery" real DEFAULT 0 NOT NULL,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"correct_attempts" integer DEFAULT 0 NOT NULL,
	"fsrs_state" jsonb,
	"is_mastered" boolean DEFAULT false NOT NULL,
	"mastered_at" timestamp with time zone,
	"last_practiced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_atom_status_student_id_atom_id_pk" PRIMARY KEY("student_id","atom_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"display_name" text NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"atom_id" text NOT NULL,
	"prompt" text,
	"answer_type" "answer_type" DEFAULT 'number' NOT NULL,
	"correct_answer" text,
	"distractors" jsonb,
	"hint" text,
	"difficulty" real,
	"generator_id" text,
	"content_hash" text,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_atom_id_atoms_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_source_id_atoms_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_target_id_atoms_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_state" ADD CONSTRAINT "gamification_state_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_atom_status" ADD CONSTRAINT "student_atom_status_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_atom_status" ADD CONSTRAINT "student_atom_status_atom_id_atoms_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_atom_id_atoms_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atoms_domain_idx" ON "atoms" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "atoms_level_idx" ON "atoms" USING btree ("level");--> statement-breakpoint
CREATE INDEX "attempts_student_atom_idx" ON "attempts" USING btree ("student_id","atom_id");--> statement-breakpoint
CREATE INDEX "attempts_student_date_idx" ON "attempts" USING btree ("student_id","answered_at");--> statement-breakpoint
CREATE INDEX "edges_target_idx" ON "edges" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "edges_source_idx" ON "edges" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sessions_student_idx" ON "sessions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sessions_teacher_idx" ON "sessions" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "sas_student_idx" ON "student_atom_status" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sas_mastered_idx" ON "student_atom_status" USING btree ("student_id","is_mastered");--> statement-breakpoint
CREATE INDEX "students_class_idx" ON "students" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "tasks_atom_idx" ON "tasks" USING btree ("atom_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_content_hash_idx" ON "tasks" USING btree ("content_hash");