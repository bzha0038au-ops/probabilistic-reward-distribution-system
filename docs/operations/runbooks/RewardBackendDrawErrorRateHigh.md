# RewardBackendDrawErrorRateHigh

抽奖错误率连续 10 分钟超过 2% 时触发。

## 症状

- 用户抽奖请求明显失败，前台可能出现统一错误提示。
- 后端日志中 draw 相关错误增多，成功率下降。
- 常见诱因是库存、预算、依赖抖动或近期 draw 逻辑变更。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "draw|prize|wallet|ledger"
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/health/ready').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

```text
sum(rate(reward_backend_draw_requests_total{outcome="error"}[10m])) / clamp_min(sum(rate(reward_backend_draw_requests_total[10m])), 1)
sum(rate(reward_backend_draw_requests_total{outcome="success"}[10m]))
sum(rate(reward_backend_draw_requests_total{outcome="error"}[10m]))
```

## 缓解步骤

1. 先确认是否为依赖异常导致的连带失败；若是，先恢复依赖。
2. 如果是单个活动、奖池或新发布逻辑异常，优先回滚配置或代码变更。
3. 若资金正确性存在疑问，停止相关写入路径并执行 `deploy/sql/finance-sanity.sql`。
4. 恢复后观察错误率在完整 10 分钟窗口内回落。

## 何时升级

- 无法区分是业务阈值触发还是真实故障。
- 抽奖失败伴随账务不一致、重复扣款或奖池状态异常。
- 需要回滚发布或人工修复库存/结算数据。
