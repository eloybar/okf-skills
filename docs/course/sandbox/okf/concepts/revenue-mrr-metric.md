---
type: Attested Computation
title: Monthly Recurring Revenue (MRR)
description: Sanctioned SQL calculation for net active subscription MRR normalized to 30-day billing cycles.
tags: [metrics, finance, mrr, billing, v0.2]
status: stable
stale_after: 2027-12-31T23:59:59Z
runtime: postgres
parameters:
  - name: as_of_date
    type: date
    default: "2026-10-01"
    description: UTC snapshot date for active subscription evaluation
executor: scripts/run-mrr-report.sh
attester: scripts/verify-mrr-reconciliation.py
generated:
  by: Antigravity/4.0
  at: 2026-10-15T09:00:00Z
verified:
  - by: okf-lint/1.6.0
    at: 2026-10-15T09:05:00Z
  - by: human:finance-lead
    at: 2026-10-16T14:20:00Z
sources:
  - id: asc606-policy
    title: Enterprise Revenue Recognition Policy (ASC 606)
    url: https://docs.acme.internal/finance/asc-606-mrr
    usage_window: 90d
    credibility:
      author: human:vp-finance
      usage_count: 142
      last_modified: 2026-09-01T00:00:00Z
  - id: billing-schema
    title: Subscriptions Table DDL
    path: db/migrations/004_subscriptions.sql
---

# Overview
Calculates Net Monthly Recurring Revenue (MRR) across all `active` and `past_due` (within 14-day grace window) subscriptions[^asc606-policy]. Annual plans are normalized by dividing `amount_cents` by 12, and usage-based overages are excluded[^billing-schema].

# Computation
```sql
SELECT
  DATE(:as_of_date) AS snapshot_date,
  ROUND(SUM(
    CASE
      WHEN billing_interval = 'year' THEN amount_cents / 12.0
      WHEN billing_interval = 'month' THEN amount_cents
      ELSE 0
    END
  ) / 100.0, 2) AS net_mrr_usd
FROM subscriptions
WHERE status IN ('active', 'past_due_grace')
  AND started_at <= :as_of_date
  AND (canceled_at IS NULL OR canceled_at > :as_of_date);
```

# Related Concepts
- [Legacy Payment Service](/concepts/legacy-payment-service.md)

[^asc606-policy]: Excludes one-time setup fees, professional services, and metered usage spikes per ASC 606 guidelines.
[^billing-schema]: Uses `subscriptions.billing_interval` and `subscriptions.amount_cents` columns.
