# RewardBackendSaasBillingCollectionAtRisk

SaaS 计费任务失败或 webhook 重试耗尽时触发。

## P. Pre-check

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 | rg "saas billing|stripe|service_role\":\"saas_billing_worker\""
psql "$DATABASE_URL" -c "select id, tenant_id, status, stripe_invoice_id, stripe_invoice_status, total_amount, updated_at from saas_billing_runs where status in ('draft', 'synced', 'finalized', 'sent', 'failed') order by updated_at desc limit 20;"
psql "$DATABASE_URL" -c "select id, tenant_id, billing_run_id, event_type, status, attempts, next_attempt_at, updated_at from saas_stripe_webhook_events where status in ('pending', 'processing', 'failed') order by updated_at desc limit 20;"
```

```text
sum(reward_backend_saas_billing_runs_total{status="failed"})
reward_backend_saas_webhook_retry_exhausted_total
sum(reward_backend_saas_webhook_events_total) by (status)
reward_backend_saas_webhook_oldest_ready_age_seconds
```

- 先确认影响的是哪批租户、哪个 billing run、还是哪类 webhook；`billing run 失败` 和 `webhook 重试耗尽` 的补救路径不同。
- 保存 `tenantId`、`billingRunId`、Stripe invoice / event id，以及失败时间窗口，后续需要对账和客户沟通。
- 在 Stripe 或外部账单状态未确认前，不要反复手工触发 `sync` / `settle` 造成重复通知或重复认定已收款。

## T. Trigger

- `RewardBackendSaasBillingCollectionAtRisk` 告警触发。
- `saas_billing_runs.status = failed` 持续存在，或 `saas_stripe_webhook_events` 出现重试耗尽。
- 商务、财务或客户成功反馈租户未收到发票、未被扣费，或账单状态长时间不更新。

## A. Action

1. 如果只是 Stripe 状态没回写，优先对目标账单执行 `POST /admin/saas/billing-runs/:billingRunId/refresh`，先把本地状态刷新到最新远端结果。
2. 如果本地账单还没正确同步到 Stripe，执行 `POST /admin/saas/billing-runs/:billingRunId/sync`；只有在你明确知道远端已经线下收款或允许 out-of-band 结算时，才执行 `POST /admin/saas/billing-runs/:billingRunId/settle`。
3. 如果某个周期根本没有生成账单，再使用 `POST /admin/saas/tenants/:tenantId/billing-runs` 补建 billing run；不要用重复 `sync` 代替补建。
4. 如果根因是 Stripe 外部退化，先保留失败证据和待补扣租户名单，避免对同一账单反复点击操作导致重复通知。
5. 恢复后核对受影响租户是否已经补扣、重新发出发票或进入人工跟进名单，并把 `tenantId` / `billingRunId` 记录到事故时间线。
