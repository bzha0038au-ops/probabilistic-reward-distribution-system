# Python SDK Draft

This directory contains a draft Python mirror of `@reward/prize-engine-sdk`.
It is meant to track the shipped SDK surface exposed from the package's
committed `dist/` entrypoints rather than repo-internal TypeScript source
imports.

Current scope:

- `PrizeEngineClient.reward(...)`
- `PrizeEngineClient.draw(...)` as a deprecated legacy alias
- `PrizeEngineClient.observability.distribution(...)`
- explicit idempotency keys for reward requests, with `create_idempotency_key()`
  available as a helper
- exponential backoff for `429` and `5xx`

The draft intentionally uses the Python standard library only so it can be
reviewed without adding repo-level Python dependencies.

Boundary notes:

- Treat this client as a trusted-runtime helper, the same as the TypeScript SDK.
- Use project API keys from a server, worker, or other protected runtime.
- When the TypeScript SDK surface changes, update this mirror against the
  published `dist` contract, not against ad hoc `src/*` internals.

Example:

```python
from prize_engine_sdk import PrizeEngineClient, create_idempotency_key

client = PrizeEngineClient(
    base_url="https://engine.example",
    environment="sandbox",
    api_key="pe_live_or_sandbox_key",
)

result = client.reward(
    {
        "agent": {"agentId": "agent-alpha", "groupId": "cohort-a"},
        "behavior": {"actionType": "checkout.completed", "score": 0.82},
        "budget": {"amount": "3.00", "currency": "USD", "window": "day"},
        "idempotencyKey": create_idempotency_key(),
    }
)
```
