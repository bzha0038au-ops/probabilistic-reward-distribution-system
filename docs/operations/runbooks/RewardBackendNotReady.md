# RewardBackendNotReady

后端必需依赖连续 5 分钟不健康时触发。

## 症状

- `GET /health/ready` 返回非 200，登录、抽奖、支付或管理端请求同步失败。
- Prometheus 中 `reward_backend_dependency_status{required="true",status="down"}` 大于 0。
- 常见伴随现象是 PostgreSQL、Redis 或外部依赖不可达。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/health/ready').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
docker compose -f docker-compose.prod.yml logs backend --tail=200
docker compose -f docker-compose.prod.yml logs postgres --tail=200
docker compose -f docker-compose.prod.yml logs redis --tail=200
```

```text
max(reward_backend_dependency_status{required="true",status="down"}) by (dependency)
```

## 缓解步骤

1. 从 `/health/ready` 输出确认是 PostgreSQL、Redis 还是外部供应商依赖异常。
2. 先恢复依赖本身，再处理应用重启；不要在依赖仍然异常时反复重启 backend。
3. 依赖恢复后执行 `docker compose -f docker-compose.prod.yml up -d backend`。
4. 再次确认 `/health/ready` 正常，并观察 5 分钟内告警自动恢复。

## 何时升级

- PostgreSQL 或 Redis 本身需要故障切换、恢复或密钥轮换。
- 15 分钟内仍无法恢复 ready。
- 怀疑已有资金状态写入不完整或数据正确性受影响。
