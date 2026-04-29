# RewardBackendWalletReconciliationDrift

用户钱包与 `ledger_entries` 计算结果不一致，或者 `wallet_balance_drift` 告警在 admin 对账面板持续出现时使用。

## P. Pre-check

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 | rg "wallet reconciliation|wallet_balance_drift|service_role\":\"wallet_reconciliation_worker\""
psql "$DATABASE_URL" -c "select id, status, scanned_users, mismatched_users, started_at, completed_at, summary from wallet_reconciliation_runs order by id desc limit 10;"
psql "$DATABASE_URL" -c "select id, user_id, status, expected_total, actual_total, last_detected_at, metadata from reconciliation_alerts where alert_type = 'wallet_balance_drift' and status <> 'resolved' order by last_detected_at desc limit 20;"
```

```bash
psql "$DATABASE_URL" -c "select id, type, amount, balance_before, balance_after, reference_type, reference_id, created_at from ledger_entries where user_id = <USER_ID> order by id desc limit 50;"
```

- 先确认是单用户漂移还是多用户同时漂移；多用户同时出现时，优先按系统性账务事故处理。
- 在 admin 里打开 `GET /admin/engine/reconciliation-alerts/summary` 和 `GET /admin/engine/reconciliation-alerts/export`，保存当前快照。
- 在根因确认前，不要直接改 `user_wallets`、`ledger_entries` 或把 alert 直接标成 `resolved`。

## T. Trigger

- admin 对账面板出现 `wallet_balance_drift` 的 `open` / `acknowledged` / `require_engineering` 告警。
- 钱包对账 worker 日志出现 `wallet reconciliation cycle failed`，或最近几轮 `mismatched_users > 0`。
- 财务巡检、客服或用户投诉发现余额与账变历史不一致。

## A. Action

1. 如果受影响用户超过 1 个、或者总差额在持续扩大，先执行 `pnpm ops:freeze-deploys --reason "wallet reconciliation drift"`，避免新版本继续放大账务偏差。
2. 在 admin 中把正在调查的告警更新为 `acknowledged`；确认是代码或批量状态机问题时更新为 `require_engineering`，避免误以为已恢复。
3. 对每个受影响用户，核对 `ledger_entries`、`withdrawals`、`deposits`、`draw_records` 与最近一次 `last_detected_at` 前后的行为，先找出“哪一笔业务写了钱包却没写账本”或“哪一笔账本写了但钱包没落地”。
4. 如果只是 worker 停跑或间隔过长，修复 worker 后重启钱包对账 worker；该 worker 启动时会立即跑一轮，可以用来验证是否恢复。
5. 只有在新一轮对账已经不再产出该用户漂移告警时，才把对应 alert 标记为 `resolved`。如果需要人工修账，必须在工单或事故记录里写明修前值、修后值、依据的 ledger 证据和审批人。
6. 除非工程侧已有经过审阅的修复 SQL，否则不要直接在生产库手工改余额列。
