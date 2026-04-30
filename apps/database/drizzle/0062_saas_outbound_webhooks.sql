CREATE TABLE IF NOT EXISTS "saas_outbound_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(255) NOT NULL,
	"events" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_outbound_webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"draw_record_id" integer,
	"event_type" varchar(64) NOT NULL,
	"event_id" varchar(191) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_http_status" integer,
	"last_error" text,
	"last_response_body" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_outbound_webhooks" ADD CONSTRAINT "saas_outbound_webhooks_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_outbound_webhook_deliveries" ADD CONSTRAINT "saas_outbound_webhook_deliveries_webhook_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."saas_outbound_webhooks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_outbound_webhook_deliveries" ADD CONSTRAINT "saas_outbound_webhook_deliveries_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_outbound_webhook_deliveries" ADD CONSTRAINT "saas_outbound_webhook_deliveries_draw_record_fk" FOREIGN KEY ("draw_record_id") REFERENCES "public"."saas_draw_records"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_outbound_webhooks_project_url_unique" ON "saas_outbound_webhooks" ("project_id","url");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_outbound_webhooks_project_active_idx" ON "saas_outbound_webhooks" ("project_id","is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_outbound_webhook_deliveries_webhook_event_unique" ON "saas_outbound_webhook_deliveries" ("webhook_id","event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_outbound_webhook_deliveries_status_next_attempt_idx" ON "saas_outbound_webhook_deliveries" ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_outbound_webhook_deliveries_project_created_idx" ON "saas_outbound_webhook_deliveries" ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_outbound_webhook_deliveries_webhook_created_idx" ON "saas_outbound_webhook_deliveries" ("webhook_id","created_at");
