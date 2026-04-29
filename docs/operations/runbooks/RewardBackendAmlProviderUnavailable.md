# RewardBackendAmlProviderUnavailable

AML provider 配置失效、上游宕机，或最近请求持续落为 `provider_error` 时使用。

## P. Pre-check

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | rg "aml screening failed|AML provider|provider_error"
psql "$DATABASE_URL" -c "select id, user_id, checkpoint, provider_key, result, created_at, provider_payload from aml_checks where result = 'provider_error' order by created_at desc limit 20;"
```

- 先确认影响 checkpoint 是 `registration`、`first_deposit` 还是 `withdrawal_request`；不同 checkpoint 的用户影响面不同。
- 核对当前 `AML_PROVIDER_KEY` 配置和最近变更记录。它现在是 opaque key，不需要改 shared-types/schema；但如果该 key 没有对应到后端已注册实现，代码会直接报 `Configured AML provider ... is not registered.`。
- 当前仓库只内建了 `mock` provider；如果生产环境没有额外注册的真实 provider，就不存在 repo-owned 的热切换后备。不要擅自把生产切到 `mock`。

## T. Trigger

- 日志持续出现 `aml screening failed`、`AML provider execution failed.` 或 `Configured AML provider ... is not registered.`。
- `aml_checks.result = 'provider_error'` 持续增长。
- 注册、首充或提现请求在 AML 检查阶段持续失败，客服收到集中报障。

## A. Action

1. 先区分是“配置错误”还是“上游 provider 宕机”。如果是配置错误，恢复有效的 `AML_PROVIDER_KEY` / secret 并重启 backend；如果是上游宕机，按外部依赖故障处理。
2. provider 故障期间按 fail-closed 处理，通知客服与合规：受影响 checkpoint 的用户流程可能暂时不可用，尤其是 `withdrawal_request` 需要优先盯住。
3. 导出最近 `provider_error` 的 `userId` 和 `checkpoint` 作为补偿清单；provider 恢复后，由工程重放筛查或让对应用户重新触发被阻断的动作。
4. 不要把 `provider_error` 记录当成命中去 `clear` / `confirm`，也不要为了恢复流量直接关闭 AML 检查，除非已经拿到明确的合规批准。
5. 如果需要临时切换到另一个 AML provider，只能在“该 provider 已在后端注册”且合规负责人批准的前提下进行，并记录切换时间、操作者和回切计划。
