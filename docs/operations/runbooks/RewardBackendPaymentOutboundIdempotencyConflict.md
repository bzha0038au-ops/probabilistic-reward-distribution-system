# RewardBackendPaymentOutboundIdempotencyConflict

15 分钟内出现支付出站幂等键冲突时触发。

## 症状

- 同一 provider/action/reason 维度出现冲突，可能存在重复出站风险。
- 后端日志中可看到 idempotency key 复用异常。
- 该告警默认按潜在资金事故处理。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "idempotency|payment|payout|withdraw"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/finance-sanity.sql
```

```text
sum(increase(reward_backend_payment_outbound_idempotency_conflicts_total[15m])) by (provider, action, reason)
sum(reward_backend_payment_outbound_requests_total) by (send_status, error_code)
max(reward_backend_payment_outbound_oldest_retry_age_seconds) by (error_code)
```

## 缓解步骤

1. 先识别冲突发生在充值、提现还是其他支付动作。
2. 立即停止对应动作的手动补单或自动重试，避免放大成重复出款或重复扣款。
3. 收集受影响请求、traceId、provider、idempotency key 和时间窗口。
4. 在确认资金未重复变动前，不要手工改写最终状态或余额。

## 何时升级

- 任意迹象表明已经发生重复打款、重复扣款或漏记账。
- 需要人工修复支付状态或账务记录。
- 无法在 15 分钟内确定影响请求集合。
