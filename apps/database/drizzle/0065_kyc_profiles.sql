CREATE TABLE IF NOT EXISTS "kyc_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "current_tier" varchar(16) DEFAULT 'tier_0' NOT NULL,
  "requested_tier" varchar(16),
  "status" varchar(32) DEFAULT 'not_started' NOT NULL,
  "submission_version" integer DEFAULT 0 NOT NULL,
  "legal_name" varchar(160),
  "document_type" varchar(32),
  "document_number_last4" varchar(8),
  "country_code" varchar(2),
  "notes" text,
  "rejection_reason" text,
  "submitted_data" jsonb,
  "risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "freeze_record_id" integer,
  "reviewed_by_admin_id" integer,
  "submitted_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kyc_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "submission_version" integer NOT NULL,
  "kind" varchar(32) NOT NULL,
  "label" varchar(160),
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "size_bytes" integer,
  "storage_path" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kyc_review_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "submission_version" integer NOT NULL,
  "action" varchar(32) NOT NULL,
  "from_status" varchar(32) NOT NULL,
  "to_status" varchar(32) NOT NULL,
  "target_tier" varchar(16),
  "actor_admin_id" integer,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_freeze_record_id_freeze_records_id_fk" FOREIGN KEY ("freeze_record_id") REFERENCES "public"."freeze_records"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_reviewed_by_admin_id_admins_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_profile_id_kyc_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."kyc_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_review_events" ADD CONSTRAINT "kyc_review_events_profile_id_kyc_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."kyc_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_review_events" ADD CONSTRAINT "kyc_review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_review_events" ADD CONSTRAINT "kyc_review_events_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kyc_profiles_user_id_unique" ON "kyc_profiles" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_profiles_status_submitted_idx" ON "kyc_profiles" ("status","submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_profiles_requested_tier_submitted_idx" ON "kyc_profiles" ("requested_tier","submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_documents_profile_submission_idx" ON "kyc_documents" ("profile_id", "submission_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_documents_user_idx" ON "kyc_documents" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_review_events_profile_created_idx" ON "kyc_review_events" ("profile_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_review_events_user_created_idx" ON "kyc_review_events" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_review_events_action_created_idx" ON "kyc_review_events" ("action","created_at");
