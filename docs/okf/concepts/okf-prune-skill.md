---
type: Skill
title: OKF Prune Skill
description: Automated lifecycle cleanup, archiving, and garbage collection for OKF bundles.
resource: okf-prune/SKILL.md
tags: [pruning, cleanup, lifecycle, archiving, automation]
status: stable
generated:
  by: Antigravity/4.0
  at: 2026-11-04T17:44:29.668Z
sources:
  - okf-prune/scripts/prune.js
---

# Overview
The `okf-prune` skill manages bundle hygiene and concept lifecycles by detecting and cleaning up outdated or invalid knowledge documents. It provides automated CLI workflows for archiving or permanently removing expired, deprecated, orphaned, or broken concepts.

# Key Functions
- **Audit & Check Mode**: Detects concepts that have passed `stale_after` expiration, carry `status: deprecated`, reference deleted local files across `resource`, `sources` (string and object entries), `computation`, `executor.resource`, and `attester.resource` (while decoding percent-encoded `file://` URIs, stripping `#fragment`/`?query` suffixes, safely ignoring non-`file://` URI schemes like `bigquery://` or `git:<sha>:<path>` and scope descriptors, and resolving `workspaceRoot` automatically when `--bundle <path>` points to another repository), or have zero inbound links across markdown body links and `sources` concept lineage references.
- **Safe Archiving**: By default, moves pruned concepts into an `archive/` directory within the bundle, updates frontmatter with `status: deprecated` and `archived_at`, and relocates concept links in `index.md` to an `## Archived Concepts` section while preserving native CRLF/LF line endings across concept files, `index.md`, and `log.md`.
- **Permanent Deletion Mode**: Allows complete removal of obsolete concepts via the `--delete` flag.
- **Category Filtering**: Allows selective pruning targeting only stale (`--stale`), deprecated (`--deprecated`), ghost (`--ghosts`), or orphaned (`--orphans`) concepts.
- **Changelog & Visualization Sync**: Appends entries to `log.md` detailing pruned items (and optionally refreshes `viz.html` when `--viz` is passed).
