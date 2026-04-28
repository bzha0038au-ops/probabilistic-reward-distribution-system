# Python SDK Draft

This directory contains a draft Python mirror of `@reward/prize-engine-sdk`.

Current scope:

- `PrizeEngineClient.reward(...)`
- `PrizeEngineClient.draw(...)` as a deprecated legacy alias
- `PrizeEngineClient.observability.distribution(...)`
- explicit idempotency keys for reward requests, with `create_idempotency_key()`
  available as a helper
- exponential backoff for `429` and `5xx`

The draft intentionally uses the Python standard library only so it can be
reviewed without adding repo-level Python dependencies.

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
