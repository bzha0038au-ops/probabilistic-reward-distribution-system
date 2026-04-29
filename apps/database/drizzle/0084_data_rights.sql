CREATE TABLE "data_deletion_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "status" varchar(32) DEFAULT 'pending_review' NOT NULL,
  "source" varchar(32) DEFAULT 'user_self_service' NOT NULL,
  "requested_by_user_id" integer,
  "request_reason" text,
  "subject_email_hint" varchar(255),
  "subject_phone_hint" varchar(64),
  "subject_email_hash" varchar(64),
  "subject_phone_hash" varchar(64),
  "due_at" timestamp with time zone NOT NULL,
  "reviewed_by_admin_id" integer,
  "review_decision" varchar(16),
  "review_notes" text,
  "reviewed_at" timestamp with time zone,
  "completed_by_admin_id" integer,
  "completed_at" timestamp with time zone,
  "failure_reason" text,
  "result_summary" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_rights_audits" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "action" varchar(32) NOT NULL,
  "actor_user_id" integer,
  "actor_admin_id" integer,
  "notes" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_requested_by_user_id_users_id_fk"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_reviewed_by_admin_id_admins_id_fk"
  FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admins"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_completed_by_admin_id_admins_id_fk"
  FOREIGN KEY ("completed_by_admin_id") REFERENCES "public"."admins"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_rights_audits"
  ADD CONSTRAINT "data_rights_audits_request_id_data_deletion_requests_id_fk"
  FOREIGN KEY ("request_id") REFERENCES "public"."data_deletion_requests"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_rights_audits"
  ADD CONSTRAINT "data_rights_audits_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_rights_audits"
  ADD CONSTRAINT "data_rights_audits_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_rights_audits"
  ADD CONSTRAINT "data_rights_audits_actor_admin_id_admins_id_fk"
  FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "data_deletion_requests_user_created_idx"
  ON "data_deletion_requests" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "data_deletion_requests_status_due_idx"
  ON "data_deletion_requests" USING btree ("status", "due_at");
--> statement-breakpoint
CREATE INDEX "data_deletion_requests_reviewed_idx"
  ON "data_deletion_requests" USING btree ("reviewed_by_admin_id", "reviewed_at");
--> statement-breakpoint
CREATE INDEX "data_deletion_requests_completed_idx"
  ON "data_deletion_requests" USING btree ("completed_by_admin_id", "completed_at");
--> statement-breakpoint
CREATE INDEX "data_rights_audits_request_created_idx"
  ON "data_rights_audits" USING btree ("request_id", "created_at");
--> statement-breakpoint
CREATE INDEX "data_rights_audits_user_created_idx"
  ON "data_rights_audits" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "data_rights_audits_action_created_idx"
  ON "data_rights_audits" USING btree ("action", "created_at");
