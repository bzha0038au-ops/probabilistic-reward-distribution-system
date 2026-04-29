# RewardBackendEconomyReversal

用于 IAP 点券、礼物包、B luck 手动补单或冲正后的统一账务回滚处理。

## 适用场景

- Apple / Google 退款、拒付、撤销后需要冲正资产。
- 礼物包发错对象、重复发货、或接收人风控命中后需要回滚。
- 后台手动补单、补发后发现资产方向错误，需要安全冲正。

## 诊断命令

```sql
select
  id,
  user_id,
  asset_code,
  entry_type,
  amount,
  reference_type,
  reference_id,
  created_at
from economy_ledger_entries
where reference_type in ('store_purchase_order', 'gift_transfer')
order by id desc
limit 50;

select
  user_id,
  asset_code,
  available_balance,
  locked_balance
from user_asset_balances
where user_id in (
  select user_id from store_purchase_orders order by id desc limit 10
)
order by user_id, asset_code;
```

## 标准步骤

1. 先确认目标单据：订单号、接收用户、资产类型、原始发货金额。
2. 优先走 Admin 经济面板的 reverse，而不是手写 SQL。
3. 如果余额足够，直接冲正对应资产；如果余额已被消耗，允许系统打 `gameplay_lock`，再由运营决定后续追偿或人工处理。
4. 冲正完成后，核对 `store_purchase_orders`、`economy_ledger_entries`、`user_asset_balances` 三处是否一致。

## 禁止操作

- 不要把 `B_LUCK` 直接改回 legacy `bonus_balance`。
- 不要删除 ledger 记录掩盖问题；只能追加 reversal。
- 不要绕过幂等键对同一订单多次补发或多次冲正。

## 何时升级

- 需要直接改数据库。
- 冲正过程中发现多用户串单、重复 receipt、或跨渠道 SKU 映射错误。
- 风控冻结和账务冲正互相阻塞，无法通过后台工具恢复。
