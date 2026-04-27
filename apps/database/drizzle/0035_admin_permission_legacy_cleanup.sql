INSERT INTO "admin_permissions" ("admin_id", "permission_key")
SELECT
  "admin_permissions"."admin_id",
  "permission_mapping"."permission_key"
FROM "admin_permissions"
JOIN (
  VALUES
    ('config.manage', 'analytics.read'),
    ('config.manage', 'config.read'),
    ('config.manage', 'config.release_bonus'),
    ('config.manage', 'config.update'),
    ('finance.manage', 'finance.read'),
    ('finance.manage', 'finance.approve_deposit'),
    ('finance.manage', 'finance.fail_deposit'),
    ('finance.manage', 'finance.approve_withdrawal'),
    ('finance.manage', 'finance.reject_withdrawal'),
    ('finance.manage', 'finance.pay_withdrawal'),
    ('finance.manage', 'finance.reconcile'),
    ('prizes.manage', 'analytics.read'),
    ('prizes.manage', 'prizes.read'),
    ('prizes.manage', 'prizes.create'),
    ('prizes.manage', 'prizes.update'),
    ('prizes.manage', 'prizes.toggle'),
    ('prizes.manage', 'prizes.delete'),
    ('security.manage', 'audit.read'),
    ('security.manage', 'audit.export'),
    ('security.manage', 'audit.retry_notification'),
    ('security.manage', 'risk.read'),
    ('security.manage', 'risk.freeze_user'),
    ('security.manage', 'risk.release_user')
) AS "permission_mapping"("legacy_permission_key", "permission_key")
  ON "permission_mapping"."legacy_permission_key" = "admin_permissions"."permission_key"
ON CONFLICT ("admin_id", "permission_key") DO NOTHING;--> statement-breakpoint

DELETE FROM "admin_permissions"
WHERE "permission_key" IN (
  'config.manage',
  'finance.manage',
  'prizes.manage',
  'security.manage'
);--> statement-breakpoint
