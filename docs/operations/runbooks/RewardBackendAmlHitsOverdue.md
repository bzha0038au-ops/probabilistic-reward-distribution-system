# RewardBackendAmlHitsOverdue

至少一条 AML 命中超过处理 SLA 且持续 5 分钟时触发。

## P. Pre-check

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "aml|freeze|review"
psql "$DATABASE_URL" -c "select id, user_id, checkpoint, risk_level, review_status, sla_due_at, created_at from aml_checks where review_status = 'pending' and result = 'hit' order by created_at asc limit 20;"
```

```text
reward_backend_aml_review_hits_total{state="pending"}
reward_backend_aml_review_hits_total{state="overdue"}
reward_backend_aml_review_oldest_pending_age_seconds
```

- 先从 admin `GET /admin/aml-checks` 或 `/aml` 页面确认超时 case 的 `amlCheckId`、`userId`、`checkpoint`、`riskLevel`。
- 核对 case 当前冻结状态是否还是 `aml_review`，避免把已经升级为 `account_lock` 的事件误当成待处理积压。
- 不要为了消告警而直接 `clear`；先确认 provider payload、review note 和当前冻结原因一致。

## T. Trigger

- `RewardBackendAmlHitsOverdue` 告警触发。
- `/aml` 队列中存在 `pending + hit` 且 `sla_due_at < now()` 的 case。
- 用户长时间停留在 `aml_review`，客服或合规团队反馈无人处理。

## A. Action

1. 在 admin 里逐条处理超时命中：误报走 `POST /admin/aml-checks/:amlCheckId/clear`，成立走 `POST /admin/aml-checks/:amlCheckId/confirm`，需要更高级别人工判断走 `POST /admin/aml-checks/:amlCheckId/escalate`。
2. `clear` 后确认对应 `aml_review` 冻结已释放；`confirm` 后确认冻结已经升级为 `account_lock`；`escalate` 后确认冻结仍然保留。
3. 如果同一时间出现多条超时命中，按 `riskLevel` 和 `checkpoint=withdrawal_request` 优先处理，先控资金外流风险。
4. 如果 15 分钟内仍无法确认误报/命中结论，立即升级给合规负责人，不要让 case 长时间停在 `pending`。
5. 如果 `reviewStatus` 已更新但冻结状态没有跟上，按状态不一致处理为工程故障并保留 `amlCheckId`、`userId`、操作人和时间线证据。
