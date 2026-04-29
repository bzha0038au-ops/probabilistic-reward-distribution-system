# Economy Rollout Plan (2026-04-30)

本次发布覆盖第 4、5、6、7 批：

- 第 4 批：`gift_pack` 购买完成、直送、退款/撤销回滚
- 第 5 批：Web / mobile / admin 钱包与经济面板接入
- 第 6 批：Admin 经济操作、监控指标、Prometheus 告警、专项 runbook
- 第 7 批：economy load smoke、Web 钱包 e2e、灰度步骤

## 发布前检查

```bash
./node_modules/.bin/tsc -p apps/backend/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/frontend/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/mobile/tsconfig.json --noEmit
cd apps/admin && ../../node_modules/.bin/svelte-kit sync && ../../node_modules/.bin/svelte-check --tsconfig ./tsconfig.json
sh scripts/run-tsx.sh tests/integration/run.ts --spec src/integration/backend.economy.iap.integration.test.ts
env -u NO_COLOR tsx tests/load/economy-smoke.ts
env -u NO_COLOR tsx tests/e2e/run.ts --spec tests/e2e/economy-wallet.spec.ts
```

## 灰度步骤

1. 先执行数据库迁移，确认 `0100_economy_foundation` 已落库，`iap_products` 与 `gift_pack_catalog` 已完成 seed。
2. 先只放开 Web 的只读展示：钱包、礼物包目录、ledger、gift history。
3. 再放开 mobile 的送礼与 gift pack 购买，优先内部账号和白名单账号。
4. 观察以下指标至少一个业务日：
   - `reward_backend_gift_sent_total`
   - `reward_backend_gift_energy_exhausted_total`
   - `reward_backend_iap_purchase_verified_total`
   - `reward_backend_iap_purchase_fulfillment_failed_total`
   - `reward_backend_gift_pack_delivered_total`
   - `reward_backend_store_purchase_orders_total`
5. 确认 Prometheus 已加载 `deploy/monitoring/prometheus-alerts.yml`，并能打开对应 runbook。
6. 若无异常，再扩大 mobile 购买人群，最后切到全量。

## 立即回滚条件

- `reward_backend_iap_purchase_fulfillment_failed_total{stage="verify"}` 在 10 分钟内持续升高
- `reward_backend_store_purchase_orders_total{status="verified"}` 持续 15 分钟不回落
- `reward_backend_gift_pack_delivered_total{mode="restore"}` 非人工 replay 情况下增长
- `reward_backend_economy_ledger_write_failed_total` 出现非零增长

## 回滚手段

1. 关闭 mobile 购买入口，保留 Web 只读。
2. 对异常账号添加 `gift_lock`，不要直接回退到 legacy `bonus_balance`。
3. 对异常订单使用 Admin 经济面板执行 replay 或 reverse。
4. 参考以下 runbook：
   - `docs/operations/runbooks/RewardBackendIapVerificationFailuresHigh.md`
   - `docs/operations/runbooks/RewardBackendGiftPackDeliveryFailure.md`
   - `docs/operations/runbooks/RewardBackendGiftingActivitySpike.md`
   - `docs/operations/runbooks/RewardBackendEconomyReversal.md`
