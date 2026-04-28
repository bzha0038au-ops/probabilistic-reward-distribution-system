# RewardBackendAmlHitsOverdue

至少一条 AML 命中超过处理 SLA 且持续 5 分钟时触发。

## 症状

- `/aml` 队列出现 `Overdue` 命中，且没有被 clear / confirm / escalate。
- 用户账号可能长时间停留在 `aml_review` 冻结状态。
- 合规团队或客服反馈命中工单无人处理。

## 诊断命令

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "aml|freeze|review"
psql "$DATABASE_URL" -c "select id, user_id, checkpoint, risk_level, review_status, sla_due_at, created_at from aml_checks where review_status = 'pending' and result = 'hit' order by created_at asc limit 20;"
```

```text
reward_backend_aml_review_hits_total{state="pending"}
reward_backend_aml_review_hits_total{state="overdue"}
reward_backend_aml_review_oldest_pending_age_seconds
```

## 缓解步骤

1. 先打开 admin `/aml` 页面，确认是哪几条命中超时。
2. 核对 provider 原始 payload、筛查上下文和当前冻结原因。
3. 如果确认是误报，执行 `clear` 并确认 `aml_review` 冻结已释放。
4. 如果确认命中成立，执行 `confirm`，把冻结升级到 `account_lock`。
5. 如果需要更高级别的人工判断，执行 `escalate`，并把备注写完整。

## 何时升级

- 无法在 15 分钟内确认是否误报。
- 命中涉及真实制裁名单、执法冻结或高风险资金来源。
- `confirm` / `clear` 后冻结状态与 AML case 状态不一致。
