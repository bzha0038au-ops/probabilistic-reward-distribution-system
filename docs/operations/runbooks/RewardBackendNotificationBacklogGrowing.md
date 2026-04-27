# RewardBackendNotificationBacklogGrowing

认证通知积压年龄或队列深度超过阈值时触发。

## 症状

- 登录验证码、注册验证或安全通知延迟明显。
- `pending`、`processing` 或 `failed` 通知数持续上升。
- 常见诱因是通知供应商故障、凭据失效或 worker 堵塞。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs notification-worker --tail=200
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "notification|sms|email"
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:4000/health/ready').then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

```text
sum(reward_backend_auth_notification_deliveries{status=~"pending|processing|failed"}) by (status)
reward_backend_auth_notification_oldest_pending_age_seconds
```

## 缓解步骤

1. 确认是供应商外部故障、认证密钥问题还是 worker 自身堆积。
2. 如果只是通知侧异常且核心 API 正常，保持 API 可用，不要无谓扩大影响。
3. 供应商恢复后再处理失败重放，避免在故障窗口内反复重试。
4. 如果 backlog 已影响登录成功率，临时限制相关高频入口并通知支持团队。

## 何时升级

- 积压超过 30 分钟并持续增长。
- 通知故障已经影响登录、MFA 或安全告警交付。
- 需要供应商升级支持或跨团队处理凭据轮换。
