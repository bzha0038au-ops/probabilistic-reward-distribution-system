# RewardBackendWithdrawalsStuck

至少一笔提现超过卡住阈值并持续 15 分钟时触发。

## P. Pre-check

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "withdraw|payout|payment"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/finance-sanity.sql
psql "$DATABASE_URL" -c "select id, user_id, status, provider_id, channel_type, asset_code, amount, provider_order_id, updated_at from withdrawals where status in ('requested', 'approved', 'provider_submitted', 'provider_processing') order by updated_at asc limit 20;"
```

```text
sum(reward_backend_withdrawals_stuck_total) by (status)
max(reward_backend_withdrawals_oldest_stuck_age_seconds) by (status)
sum(reward_backend_payment_outbound_requests_total) by (send_status, error_code)
```

- 先记录受影响提现单的 `withdrawalId`、`userId`、渠道（`fiat` / `crypto`）、provider、当前 `status` 和外部参考号。
- 判断是单笔卡住、单 provider 卡住还是整条提现链路退化；范围不同，处置优先级不同。
- 在没有外部结算证据前，不要直接把提现改成 `paid`，也不要手工改 `user_wallets` 余额。

## T. Trigger

- `RewardBackendWithdrawalsStuck` 告警触发。
- 用户提现长时间停留在 `requested` / `approved` / `provider_submitted` / `provider_processing`。
- 财务、客服或支付侧反馈审批后没有继续推进，或到账与本地状态不一致。

## A. Action

1. 先按状态定位卡住阶段：`requested` 需要判断是继续 `approve` 还是 `reject`；`approved` 需要判断是否进入 `provider-submit`；`provider_submitted` / `provider_processing` 需要结合支付方证据推进到 `provider-processing`、`pay`、`provider-fail` 或 `reverse`。
2. 法币提现走 `/admin/withdrawals/:withdrawalId/*` 手工推进状态；链上提现优先用 `/admin/withdrawals/:withdrawalId/crypto-submit` 和 `/admin/withdrawals/:withdrawalId/crypto-confirm`，不要混用法币状态推进接口。
3. 如果是 provider 侧普遍退化，先暂停新的手工放款操作，必要时执行 `pnpm ops:freeze-deploys --reason "withdrawals stuck"`，避免重复出款和状态雪崩。
4. 如果是内部状态机或 worker 卡住，先保留受影响单据、请求日志、provider 证据，再决定是否需要 `reverse` 或人工补偿。
5. 恢复后重新跑 `pnpm ops:check-finance`，并抽样核对提现单、`ledger_entries` 和 provider 侧结果是否一致。
