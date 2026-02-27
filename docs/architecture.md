# Architecture Notes

## Layering

- Controller: request validation + response mapping
- Service: business orchestration and transaction boundaries
- Repository: reusable data-access queries
- Model: ORM mapping and relationships

## Critical Transaction Boundary

`DrawService::executeDraw()` is the single critical transaction boundary for draw behavior.
It must lock wallet and prize rows before mutation.

## Prize Eligibility Rules

A prize is eligible only when:
- `is_active = true`
- `stock > 0`
- `pool_threshold <= current_pool_balance`

## Weighted Selection

Given eligible prizes and positive integer weights:
- total weight = sum(weight)
- random integer in `[1, totalWeight]`
- cumulative scan to select target prize

## Operational Metrics

- total draw count
- win/miss ratio
- prize distribution histogram
- total system pool movement
- top user spending leaderboard

