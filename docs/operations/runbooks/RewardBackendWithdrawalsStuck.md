# RewardBackendWithdrawalsStuck

至少一笔提现超过卡住阈值并持续 15 分钟时触发。

## 症状

- 提现长时间停留在处理中，用户迟迟未到账。
- 财务或客服反馈提现审批后没有继续推进。
- 该告警默认按资金风险处理。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "withdraw|payout|payment"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/finance-sanity.sql
```

```text
sum(reward_backend_withdrawals_stuck_total) by (status)
max(reward_backend_withdrawals_oldest_stuck_age_seconds) by (status)
sum(reward_backend_payment_outbound_requests_total) by (send_status, error_code)
```

## 缓解步骤

1. 先确认卡住阶段是审批、出款还是回写状态。
2. 如果上游支付方异常，暂停新的手工放款操作，避免重复出款。
3. 如果是内部状态推进卡住，先收集受影响提现单和请求日志，再决定是否人工补偿。
4. 资金正确性未确认前，不要直接修改余额或提现最终状态。

## 何时升级

- 任何场景下怀疑出现重复打款、漏打款或账务不平。
- 需要人工修复生产资金数据。
- 15 分钟内无法确认卡住节点或影响范围。
