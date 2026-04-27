# RewardBackendPaymentReconciliationQueueGrowing

人工复核对账队列数量或最老问题年龄超过阈值时触发。

## 症状

- 人工复核项持续积压，财务核对无法及时清空。
- 某个 provider 的差异单明显增长，老问题超过 30 分钟。
- 常见诱因是 webhook 延迟、对账逻辑回归或支付方返回数据异常。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "reconciliation|finance|payment"
```

```text
sum(reward_backend_payment_reconciliation_open_issues_total{requires_manual_review="true"}) by (provider)
max(reward_backend_payment_reconciliation_oldest_open_issue_age_seconds{requires_manual_review="true"}) by (provider)
sum(reward_backend_payment_webhook_events_total) by (provider, processing_status, signature_status)
```

## 缓解步骤

1. 先判断是单一 provider 积压还是所有 provider 同步堆积。
2. 如果根因来自 webhook 或 Stripe 侧退化，先处理上游入口，再回头清队列。
3. 对账差异只能在证据充分时逐条处理，不要批量关闭人工复核项。
4. 队列回落后，确认没有新的老问题继续累积。

## 何时升级

- 老问题持续超过 1 小时。
- 对账差异已经影响资金结论或财务关账。
- 需要支付、财务和后端一起做人工核对。
