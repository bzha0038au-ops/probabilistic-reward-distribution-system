# RewardBackendStripeApiDegraded

Stripe 限流、5xx 或出站重试堆积超过阈值时触发。

## 症状

- 与 Stripe 的自动化交互出现 429、5xx 或未知发送状态。
- 出站支付请求开始积压，自动重试变多。
- 该告警已降为 `ticket` 并建议 4 小时重复一次，避免 Stripe 自身故障刷屏。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "stripe|rate_limit|server_error|payment"
```

```text
sum(increase(reward_backend_stripe_api_failures_total{reason=~"rate_limit|server_error"}[10m])) by (surface, operation, reason)
sum(reward_backend_payment_outbound_requests_total{send_status=~"unknown|failed",error_code=~"stripe_rate_limit|stripe_server_error"}) by (error_code)
max(reward_backend_payment_outbound_oldest_retry_age_seconds) by (error_code)
```

## 缓解步骤

1. 先确认是 Stripe 普遍退化，还是只有某个 surface 或 operation 异常。
2. 如果是 Stripe 外部故障，避免手动狂点重试；让现有退避逻辑继续工作。
3. 如果只有单一路径异常，暂停该自动化入口并保留待重试队列。
4. 当 Stripe 恢复后，确认积压请求开始自然回落，再决定是否人工补跑。

## 何时升级

- 重试队列持续增长超过 4 小时。
- 已经影响用户入金、出金或 SaaS 扣费的业务承诺。
- 怀疑不是 Stripe 外部故障，而是本方签名、密钥或网络问题。
