INSERT INTO "admin_permissions" ("admin_id", "permission_key")
SELECT
  "admins"."id",
  "permission_seed"."permission_key"
FROM "admins"
CROSS JOIN (
  VALUES
    ('prizes.manage'),
    ('finance.manage'),
    ('security.manage'),
    ('config.manage')
) AS "permission_seed"("permission_key")
WHERE "admins"."is_active" = true
ON CONFLICT ("admin_id", "permission_key") DO NOTHING;--> statement-breakpoint
