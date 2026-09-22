---
type: Skill
title: OKF Prune Skill
description: Automated lifecycle cleanup, archiving, and garbage collection for OKF bundles.
resource: file:///D:/projects/okf-skills/okf-prune/SKILL.md
tags: [pruning, cleanup, lifecycle, archiving, automation]
status: stable
generated:
  by: Antigravity/3.5-Flash
  at: 2026-09-22T17:45:38.071Z
---

# Overview
The `okf-prune` skill manages bundle hygiene and concept lifecycles by detecting and cleaning up outdated or invalid knowledge documents. It provides automated CLI workflows for archiving or permanently removing expired, deprecated, orphaned, or broken concepts.

# Key Functions
- **Audit & Check Mode**: Detects concepts that have passed `stale_after` expiration, carry `status: deprecated`, reference deleted local files, or have zero inbound links.
- **Safe Archiving**: By default, moves pruned concepts into an `archive/` directory within the bundle, updates frontmatter with `status: deprecated` and `archived_at`, and relocates concept links in `index.md` to an `## Archived Concepts` section.
- **Permanent Deletion Mode**: Allows complete removal of obsolete concepts via the `--delete` flag.
- **Category Filtering**: Allows selective pruning targeting only stale (`--stale`), deprecated (`--deprecated`), ghost (`--ghosts`), or orphaned (`--orphans`) concepts.
- **Changelog & Visualization Sync**: Appends entries to `log.md` detailing pruned items and triggers graph visualization updates.
