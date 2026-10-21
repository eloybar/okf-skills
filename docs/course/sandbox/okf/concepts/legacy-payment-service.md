---
type: Architecture
title: Legacy Payment Service
description: Stripe webhook processor written in OKF v0.1 format to practice okf-upgrade migration.
resource: src/payments.js
tags: [payments, webhooks, legacy, v0.1]
timestamp: 2025-11-15T10:30:00Z
---

# Overview
The Legacy Payment Service processes incoming Stripe `invoice.paid` and `customer.subscription.deleted` events idempotently using a Redis lock table.

# Retry Policy
Failed webhook deliveries are retried up to 5 times with exponential backoff before routing to the Dead Letter Queue (DLQ).

# Citations
- Stripe Webhook Design Doc: https://docs.acme.internal/payments/webhooks
- Redis Idempotency Guide: src/payments.js
