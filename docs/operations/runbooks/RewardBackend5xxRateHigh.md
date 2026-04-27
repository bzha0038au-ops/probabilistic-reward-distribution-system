# RewardBackend5xxRateHigh

后端 5xx 占比连续 10 分钟超过 5% 时触发。

## 症状

- 前台、管理台或 API 调用开始返回 500、502、503。
- 反向代理与 backend 日志同时出现错误，用户投诉集中在多个路由。
- 常见诱因是最近发布回归、数据库/Redis 抖动、上游依赖超时。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs reverse-proxy --tail=200
docker compose -f docker-compose.prod.yml logs backend --tail=200
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/health/ready').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

```text
sum(rate(reward_backend_http_requests_total{status_code=~"5.."}[5m])) / clamp_min(sum(rate(reward_backend_http_requests_total[5m])), 1)
histogram_quantile(0.95, sum(rate(reward_backend_http_request_duration_seconds_bucket[5m])) by (le, route))
```

## 缓解步骤

1. 先判断是否为单一路由回归；如果是，优先回滚最近发布或临时下线问题入口。
2. 如果 `/health/ready` 同时异常，按 `RewardBackendNotReady` 先恢复依赖。
3. 如果 5xx 涉及资金写路径，先冻结写入，再继续排查。
4. 观察 10 分钟窗口内 5xx 占比是否回落到阈值以下。

## 何时升级

- 无法在 15 分钟内定位到单一发布或单一依赖。
- 5xx 涉及提现、充值、账务或抽奖结算正确性。
- 需要回滚生产版本、切流或启用灾备。
