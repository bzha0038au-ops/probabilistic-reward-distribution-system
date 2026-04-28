INSERT INTO "admin_permissions" ("admin_id", "permission_key")
SELECT "admins"."id", permissions.permission_key
FROM "admins"
CROSS JOIN (
  VALUES ('tables.read'), ('tables.manage')
) AS permissions(permission_key)
ON CONFLICT ("admin_id", "permission_key") DO NOTHING;
