# RewardBackendHoldemTableDeadlock

Hold'em 桌面长时间不推进、同一行动位反复超时，或 timeout worker 无法把过期行动推进时使用。

## P. Pre-check

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 | rg "holdem timeout|table-monitoring|holdem"
psql "$DATABASE_URL" -c "select t.id, t.name, t.status, t.updated_at, s.seat_index, s.user_id, s.status as seat_status, s.turn_deadline_at, s.disconnect_grace_expires_at from holdem_tables t left join holdem_table_seats s on s.table_id = t.id where t.id = <TABLE_ID> order by s.seat_index;"
```

- 先从 admin `GET /admin/table-monitoring` 确认 `tableId`、`roundId`、`currentActorSeatIndex`、当前桌面 `status` 是否已是 `overdue`。
- 核对 `HOLDEM_TIMEOUT_WORKER_ENABLED` 是否开启，以及最近日志里是否出现 `holdem timeout cycle failed` 或 `holdem timeout cycle skipped because a prior run is still active`。
- 保存受影响座位、用户、当前底池阶段和最近操作时间；不要一上来直接改数据库里的 `holdem_tables` / `holdem_table_seats`。

## T. Trigger

- 用户或客服反馈桌面“卡住不动”，持续时间超过两倍 `HOLDEM_TURN_TIMEOUT_MS`。
- admin `table-monitoring` 中同一张 `holdem` 桌反复处于 `overdue`。
- timeout worker 日志报错，或同一行动位在强制超时后仍然立刻再次卡死。

## A. Action

1. 先区分是单桌异常还是整批桌面都不推进；如果多桌同时 `overdue`，优先按 worker 故障处理，而不是逐桌人工操作。
2. 单桌且当前行动位确实超时时，执行 `POST /admin/table-monitoring/holdem/:tableId/force-timeout`，让系统按现有规则推进回合。
3. 如果问题集中在某个断线或异常座位，且强制超时后仍不能恢复，执行 `POST /admin/table-monitoring/holdem/:tableId/seats/:seatIndex/kick` 把异常座位移出。
4. 如果底池或状态已经不可信、无法安全继续，执行 `POST /admin/table-monitoring/holdem/:tableId/close`，并在 reason 里写清事故编号与关闭原因。
5. 如果是 worker 故障，先恢复或重启 holdem timeout worker，再回到 `GET /admin/table-monitoring` 复核是否自动清掉 `overdue` 桌；只有 worker 恢复后仍残留的单桌问题才做手工干预。
6. 除非工程侧已经准备好经过复核的修复方案，否则不要直接在生产库手改桌状态、座位状态或 `turn_deadline_at`。
