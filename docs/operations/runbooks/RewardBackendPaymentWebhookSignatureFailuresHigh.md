# RewardBackendPaymentWebhookSignatureFailuresHigh

支付 webhook 签名失败次数和失败比率同时超阈值时触发。

## 症状

- 某个支付提供商 webhook 大量被拒，入账或状态回写延迟。
- 后端日志出现签名校验失败，provider 维度异常集中。
- 常见诱因是 webhook secret 不一致、代理改写请求体、供应商侧配置漂移。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "webhook|signature|payment"
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/health/ready').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

```text
sum(increase(reward_backend_payment_webhook_signature_verifications_total{status="failed"}[10m])) by (provider)
sum(increase(reward_backend_payment_webhook_signature_verifications_total[10m])) by (provider)
sum(reward_backend_payment_webhook_events_total) by (provider, processing_status, signature_status)
```

## 缓解步骤

1. 先确认异常集中在哪个 provider，再核对该 provider 的 webhook secret 和 endpoint 配置。
2. 检查是否有反向代理、WAF 或中间件改写了 webhook 原始请求体。
3. 在签名正确性恢复前，不要盲目重放失败 webhook。
4. 恢复后观察 10 分钟窗口内失败次数和失败比率是否回落。

## 何时升级

- 无法确认 secret、请求体或供应商配置哪一侧发生漂移。
- 已经影响充值、提现或账务状态回写。
- 需要供应商支持协助确认 webhook 重试和签名策略。
