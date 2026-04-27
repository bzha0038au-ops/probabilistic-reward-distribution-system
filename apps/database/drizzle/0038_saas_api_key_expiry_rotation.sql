ALTER TABLE "saas_api_keys"
ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "saas_api_keys"
SET "expires_at" = COALESCE("expires_at", now() + interval '90 days');
--> statement-breakpoint
ALTER TABLE "saas_api_keys"
ALTER COLUMN "expires_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_api_keys"
ADD COLUMN IF NOT EXISTS "rotated_from_api_key_id" integer;
--> statement-breakpoint
ALTER TABLE "saas_api_keys"
ADD COLUMN IF NOT EXISTS "rotated_to_api_key_id" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_api_keys_expires_idx" ON "saas_api_keys" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_api_keys_rotated_from_unique" ON "saas_api_keys" ("rotated_from_api_key_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_api_keys_rotated_to_unique" ON "saas_api_keys" ("rotated_to_api_key_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_api_keys" ADD CONSTRAINT "saas_api_keys_rotated_from_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("rotated_from_api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saas_api_keys" ADD CONSTRAINT "saas_api_keys_rotated_to_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("rotated_to_api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
