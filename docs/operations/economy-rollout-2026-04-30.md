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

## 真实商店沙盒联调前置条件

1. `apps/mobile/app.json` 里的 `ios.bundleIdentifier` 与 `android.package`
   必须已经替换成真实商店应用 ID，不能继续使用占位值
   `com.anonymous.rewardmobile`。
2. App Store Connect / Play Console 里的商品 ID 必须和仓库 seed 保持一致：
   - `reward.ios.voucher.small|medium|large`
   - `reward.android.voucher.small|medium|large`
   - `reward.ios.gift-pack.rose`
   - `reward.android.gift-pack.rose`
3. 真实沙盒联调环境必须关闭本地 stub：
   - `IAP_LOCAL_STUB_VERIFICATION_ENABLED=false`
4. 后端必须配置真实验签凭据：
   - Apple: `APPLE_IAP_*`
   - Google: `GOOGLE_PLAY_*`
5. Apple/Google 服务端通知通道必须先打通，再开始退款/撤销回滚联调：
   - Apple -> `POST /iap/notifications/apple`
   - Google RTDN -> 通过 Pub/Sub push proxy 转发到
     `POST /iap/notifications/google`
6. 只有真实 Apple/Google 验签成功才会自动发货；如果当前环境还在走
   `local_stub`，订单会停在 `verified`，需要后台 Economy Operations 页面
   手动 `Approve`。

## 真实商店沙盒联调验收

1. 真机拉起商品目录并能拿到真实价格，而不是只显示 catalog fallback。
2. 购买完成后，`store_purchase_orders.status` 必须落到 `fulfilled`。
3. 最新 `store_purchase_receipts.metadata.verificationMode` 不得为
   `local_stub`。
4. 点券购买必须把 `IAP_VOUCHER` 记到用户资产余额。
5. 礼物包购买必须把 `B_LUCK` 记到接收人资产余额。
6. Apple/Google 退款或撤销信号到达后，订单必须进入
   `refunded/revoked/reversed` 的对应恢复路径。

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
