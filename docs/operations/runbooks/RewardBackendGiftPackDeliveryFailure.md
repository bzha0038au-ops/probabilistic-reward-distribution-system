# RewardBackendGiftPackDeliveryFailure

礼物包发货积压、恢复发货或重复通知导致的异常时使用本 runbook。

## 症状

- `reward_backend_store_purchase_orders_total{status="verified"}` 持续大于 0。
- `reward_backend_gift_pack_delivered_total{mode="restore"}` 在短时间内增长。
- 接收人没有收到礼物包权益，或 Admin 经济面板里有 `verified` 订单长期未转为 `fulfilled`。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=300 | rg "gift pack|store purchase|fulfill|reverse|restore"
```

```sql
select
  o.id,
  o.status,
  o.user_id,
  o.recipient_user_id,
  p.store_channel,
  p.sku,
  p.delivery_type,
  o.created_at,
  o.updated_at
from store_purchase_orders o
join iap_products p on p.id = o.iap_product_id
where p.delivery_type = 'gift_pack'
order by o.updated_at desc
limit 30;

select
  id,
  sender_user_id,
  receiver_user_id,
  amount,
  status,
  created_at
from gift_transfers
order by id desc
limit 30;
```

## 缓解步骤

1. 先确认接收人是否被冻结，尤其是 `gift_lock`、`gameplay_lock` 或 `account_lock`。
2. 如果订单是 `verified` 但没发货，优先在 Admin 经济面板执行 replay fulfillment。
3. 如果订单已经发货但商店后续退款/撤销到达，执行 reverse，确保 B 端收礼流水和 A 端购买流水都被冲正。
4. 对同一订单的重复通知，不要重复发货；只允许 restore/replay 走幂等恢复路径。

## 何时升级

- replay 后仍然无法发货，或 replay 导致重复发货。
- 订单状态、账本和资产余额三者不一致。
- 需要手工 SQL 修复 `store_purchase_orders`、`store_purchase_receipts`、`economy_ledger_entries`。
