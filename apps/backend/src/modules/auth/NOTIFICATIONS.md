# Auth Notifications

## Scope

This subdomain owns auth-related email/SMS delivery, retry scheduling, provider
selection, delivery summary reporting, and the admin retry flow.

## Source Of Truth

- Shared delivery enums and admin query schema: `apps/shared-types/src/notification.ts`
- Database schema and durable outbox tables: `apps/database/src/modules/notification.ts`
- Runtime delivery logic: `notification-service.ts`
- Async worker loop: `notification-dispatcher.ts`,
  `../../workers/auth-notification-worker.ts`

## Review Notes

- Delivery status, provider, kind, and channel values should be imported from
  `@reward/shared-types`, not duplicated inline in routes or services.
- Admin `/admin/notification-deliveries` filters should parse through the
  shared query schema so UI and backend stay aligned.
