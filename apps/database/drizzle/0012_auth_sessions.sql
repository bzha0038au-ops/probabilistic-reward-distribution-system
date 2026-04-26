ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" ("phone");--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "mfa_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "mfa_enabled_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" varchar(255),
	"phone" varchar(32),
	"token_type" varchar(32) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"metadata" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_user_idx" ON "auth_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_email_idx" ON "auth_tokens" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_phone_idx" ON "auth_tokens" ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_type_idx" ON "auth_tokens" ("token_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_expires_idx" ON "auth_tokens" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_hash_idx" ON "auth_tokens" ("token_hash");
