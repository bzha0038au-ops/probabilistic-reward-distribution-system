# RewardBackendSaasBillingCollectionAtRisk

SaaS 计费任务失败或 webhook 重试耗尽时触发。

## 症状

- 租户可能未被成功扣费，计费自动化处于降级状态。
- 失败账单任务或 retry exhausted webhook 持续存在。
- 常见诱因是 Stripe 侧退化、任务逻辑回归或配置错误。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "saas|billing|stripe"
```

```text
sum(reward_backend_saas_billing_runs_total{status="failed"})
reward_backend_saas_webhook_retry_exhausted_total
sum(reward_backend_saas_webhook_events_total) by (status)
reward_backend_saas_webhook_oldest_ready_age_seconds
```

## 缓解步骤

1. 先确认是账单任务失败还是 webhook 重试耗尽，两者的补救路径不同。
2. 如果根因是 Stripe 外部退化，优先保留失败证据和待补扣名单，不要手动反复触发。
3. 如果是内部配置或代码回归，修复后再有序补跑账单任务。
4. 恢复后核对失败租户是否已经补扣或进入人工跟进名单。

## 何时升级

- 租户计费窗口已被错过，需要客户沟通或人工补扣。
- 失败影响跨多个租户或多个账单周期。
- 需要财务或商业负责人评估实际收入风险。
