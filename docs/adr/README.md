# Architecture Decision Records

This directory stores the architecture and product-boundary decisions that are
easy to lose during rewrites, package moves, or surface splits.

## Conventions

- File name format: `NNNN-kebab-case.md`
- Status values:
  - `Proposed`
  - `Accepted`
  - `Superseded by ADR NNNN`
  - `Deprecated`
- Historical backfills should use `Accepted - backfilled on YYYY-MM-DD`.
- Each ADR should cite the current source-of-truth files and, when possible,
  the tests that lock the behavior down.

## Process

- New architectural or product-boundary decisions should land in the same PR as
  the code or contract change that depends on them.
- A new ADR is not considered accepted until that PR is reviewed and merged.
- When a decision changes, add a new ADR instead of rewriting history in place,
  then mark the older ADR as superseded.
- Keep ADRs short and factual. If a topic becomes implementation-heavy, link to
  the detailed module README or contract file instead of duplicating it here.

## Index

- [ADR 0001: Engine Vs Product Split](./0001-engine-vs-product-split.md)
- [ADR 0002: Prize Engine Selection Strategies](./0002-prize-engine-selection-strategies.md)
- [ADR 0003: Prize Engine Envelope Layers](./0003-prize-engine-envelope-layers.md)
- [ADR 0004: User Freeze Taxonomy](./0004-user-freeze-taxonomy.md)
- [ADR 0005: Consumer Economy Assets And Gifting](./0005-consumer-economy-assets-and-gifting.md)
