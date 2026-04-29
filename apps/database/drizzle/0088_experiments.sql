CREATE TABLE IF NOT EXISTS "experiments" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(128) NOT NULL,
  "description" varchar(255),
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "default_variant_key" varchar(64) DEFAULT 'control' NOT NULL,
  "variants" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "experiments_key_unique" ON "experiments" ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiments_status_idx" ON "experiments" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experiment_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "experiment_id" integer NOT NULL REFERENCES "experiments"("id") ON DELETE cascade,
  "subject_type" varchar(64) NOT NULL,
  "subject_key" varchar(191) NOT NULL,
  "variant_key" varchar(64) NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "experiment_assignments_experiment_subject_unique" ON "experiment_assignments" ("experiment_id", "subject_type", "subject_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiment_assignments_subject_lookup_idx" ON "experiment_assignments" ("subject_type", "subject_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiment_assignments_experiment_variant_idx" ON "experiment_assignments" ("experiment_id", "variant_key");
