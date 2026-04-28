CREATE TABLE IF NOT EXISTS "legal_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_key" varchar(64) NOT NULL,
	"locale" varchar(16) DEFAULT 'zh-CN' NOT NULL,
	"title" varchar(160) NOT NULL,
	"version" integer NOT NULL,
	"html_content" text NOT NULL,
	"summary" text,
	"change_notes" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_by_admin_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_documents_key_locale_version_unique"
ON "legal_documents" ("document_key", "locale", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_documents_key_locale_version_idx"
ON "legal_documents" ("document_key", "locale", "version");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_document_publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"document_key" varchar(64) NOT NULL,
	"locale" varchar(16) NOT NULL,
	"release_mode" varchar(32) NOT NULL,
	"rollout_percent" integer DEFAULT 100 NOT NULL,
	"fallback_publication_id" integer,
	"rollback_from_publication_id" integer,
	"change_request_id" integer,
	"published_by_admin_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by_publication_id" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_document_publications_active_idx"
ON "legal_document_publications" ("document_key", "locale", "is_active", "activated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_document_publications_document_idx"
ON "legal_document_publications" ("document_id", "activated_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_document_publications" ADD CONSTRAINT "legal_document_publications_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_document_publications" ADD CONSTRAINT "legal_document_publications_change_request_id_config_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."config_change_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_document_publications" ADD CONSTRAINT "legal_document_publications_published_by_admin_id_admins_id_fk" FOREIGN KEY ("published_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_document_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"publication_id" integer,
	"user_id" integer NOT NULL,
	"source" varchar(64) DEFAULT 'user' NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(255),
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_document_acceptances_user_document_unique"
ON "legal_document_acceptances" ("user_id", "document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_document_acceptances_document_idx"
ON "legal_document_acceptances" ("document_id", "accepted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_document_acceptances_user_idx"
ON "legal_document_acceptances" ("user_id", "accepted_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_document_acceptances" ADD CONSTRAINT "legal_document_acceptances_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_document_acceptances" ADD CONSTRAINT "legal_document_acceptances_publication_id_legal_document_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."legal_document_publications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_document_acceptances" ADD CONSTRAINT "legal_document_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
