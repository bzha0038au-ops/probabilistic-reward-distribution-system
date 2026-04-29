ALTER TABLE "kyc_profiles"
  ADD COLUMN IF NOT EXISTS "active_submission_version" integer;
--> statement-breakpoint
ALTER TABLE "kyc_documents"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "kyc_profiles"
SET "active_submission_version" = "submission_version"
WHERE "active_submission_version" IS NULL
  AND "current_tier" <> 'tier_0'
  AND "status" = 'approved';
--> statement-breakpoint
UPDATE "kyc_profiles" AS "profile"
SET "active_submission_version" = "latest_approved"."submission_version"
FROM (
  SELECT DISTINCT ON ("profile_id")
    "profile_id",
    "submission_version"
  FROM "kyc_review_events"
  WHERE "action" = 'approved'
  ORDER BY "profile_id", "created_at" DESC, "id" DESC
) AS "latest_approved"
WHERE "profile"."active_submission_version" IS NULL
  AND "profile"."current_tier" <> 'tier_0'
  AND "profile"."id" = "latest_approved"."profile_id";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_documents_expires_at_idx"
  ON "kyc_documents" ("expires_at");
