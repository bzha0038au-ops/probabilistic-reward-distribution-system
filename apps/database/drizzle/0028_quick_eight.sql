CREATE TABLE IF NOT EXISTS "quick_eight_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"selected_numbers" jsonb NOT NULL,
	"drawn_numbers" jsonb NOT NULL,
	"matched_numbers" jsonb NOT NULL,
	"hit_count" integer NOT NULL,
	"multiplier" numeric(14, 2) DEFAULT '0' NOT NULL,
	"stake_amount" numeric(14, 2) NOT NULL,
	"payout_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" varchar(32) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_eight_rounds" ADD CONSTRAINT "quick_eight_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quick_eight_rounds_user_created_idx" ON "quick_eight_rounds" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quick_eight_rounds_status_created_idx" ON "quick_eight_rounds" ("status","created_at");
