# RewardBackendIapVerificationFailuresHigh

IAP 商店验证在 10 分钟内失败超过 10 次时触发。

## 症状

- iOS 或 Android 购买成功后，用户迟迟收不到 `IAP_VOUCHER` 或礼物包权益。
- `POST /iap/purchases/verify` 和商店服务端通知日志里出现 Apple/Google 验签或查询失败。
- Admin 经济面板里 `created/verified` 订单增长，但 `fulfilled` 没跟上。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=300 | rg "iap|storekit|play billing|apple|google|receipt|purchase"
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/metrics').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))" \
  | rg "reward_backend_iap_purchase_(verified|fulfillment_failed)_total"
```

```sql
select
  status,
  count(*)::int as count
from store_purchase_orders
group by status
order by status;

select
  id,
  store_channel,
  external_transaction_id,
  created_at,
  metadata
from store_purchase_receipts
order by id desc
limit 20;
```

## 缓解步骤

1. 先确认 Apple 或 Google 凭据、bundle/package 配置、商店通知密钥是否变更。
2. 若是外部商店依赖抖动，先暂停前台购买入口或只保留只读商品展示，避免继续放大积压。
3. 对已经 `created` 但未验证的订单，等待商店恢复后重新触发客户端重试或服务端通知重放。
4. 如果通知路径异常而 receipt 本身有效，使用 Admin 经济面板或内部工具重放验证/发货。

## 何时升级

- Apple 或 Google 官方状态页显示异常且持续超过 15 分钟。
- 验证失败伴随重复发货、错误发货或账务冲正失败。
- 需要临时关闭某一商店渠道的购买能力。
