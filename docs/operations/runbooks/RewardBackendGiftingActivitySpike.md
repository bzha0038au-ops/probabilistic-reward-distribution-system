# RewardBackendGiftingActivitySpike

B luck 送礼量在 10 分钟内明显异常放大时触发。

## 症状

- `reward_backend_gift_sent_total` 在短时间内激增。
- 同一批用户互送、同设备多号互送、低龄号集中送礼的记录增加。
- 运营或客服收到“送礼失败 / 能量耗尽 / 被限制送礼”的集中反馈。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=300 | rg "gift|gift_lock|economy|transfer"
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/metrics').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))" \
  | rg "reward_backend_gift_(sent|energy_exhausted)_total"
```

```sql
select
  sender_user_id,
  receiver_user_id,
  count(*)::int as transfer_count,
  sum(amount)::numeric(18,2) as total_amount,
  max(created_at) as last_transfer_at
from gift_transfers
where created_at >= now() - interval '24 hours'
group by sender_user_id, receiver_user_id
order by total_amount desc, transfer_count desc
limit 30;

select
  user_id,
  scope,
  status,
  reason,
  created_at
from freeze_records
where scope = 'gift_lock'
order by created_at desc
limit 30;
```

## 缓解步骤

1. 先在 Admin 经济面板查看 `riskSignals` 和活跃 `gift_lock` 记录，判断是自然活动峰值还是异常互送。
2. 对命中的账号先加 `gift_lock`，不要直接冻结整账号，避免误伤正常消费链路。
3. 若是活动投放导致的自然高峰，检查 `gift_energy_accounts` 是否按预期回满，避免把运营流量误判为刷量。
4. 如需临时降载，可下调活动发放或前端送礼入口曝光，但不要把 `B_LUCK` 再接回提现/兑换路径。

## 何时升级

- 同设备、同 IP、多账号矩阵互送已经确认，需要风控或法务介入。
- 送礼异常伴随经济账本写失败、余额不一致或订单回滚异常。
- 需要临时对全站送礼功能做 kill switch。
