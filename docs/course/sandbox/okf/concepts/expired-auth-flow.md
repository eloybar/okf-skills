---
type: Concept
title: Expired OAuth1 Flow
description: Legacy authentication handshake with an expired stale_after timestamp for okf-prune exercises.
tags: [auth, oauth1, legacy, security]
status: stable
stale_after: 2025-01-01T00:00:00Z
generated:
  by: claude-code/1.0.0
  at: 2024-06-01T12:00:00Z
---

# Overview
This concept documents the legacy OAuth 1.0a signature handshake used by v1 mobile clients. Its `stale_after` timestamp (`2025-01-01T00:00:00Z`) has already passed, making it a prime target for `okf-prune --dry-run`.

# Related Concepts
- [Legacy Payment Service](/concepts/legacy-payment-service.md)
