---
name: okf-prune
description: Use when an OKF bundle contains stale, expired, deprecated, orphaned, or dangling concepts that need pruning, archiving, or cleanup.
version: 1.8.1
---

# `okf-prune` Workflow

Maintain knowledge bundle hygiene through automated concept lifecycle pruning, archiving, and garbage collection aligned with OKF v0.2 (§5.4, §5.5, §6.2, §10).

## Overview

Over the lifecycle of a codebase, concepts change:
- Features are deprecated or removed (`status: deprecated`, §5.4).
- Temporary contracts or deadlines expire (`stale_after`, §5.5).
- Underlying source code or computation files are deleted, leaving ghost concepts with missing local `resource`, `sources`, `computation`, `executor.resource`, or `attester.resource` files (§6.2, §10.2).
- Concepts become disconnected and orphaned with 0 inbound links (across `index.md`, body cross-links, and `sources` concept lineage links).

`okf-prune` systematically audits the bundle, identifies candidates for removal or archiving, moves them safely to `archive/` (or permanently deletes them), updates `index.md`, logs the changes in `log.md`, and refreshes `viz.html`.

## Usage

```bash
# 1. Audit / Check Mode (Read-Only)
# Scans bundle and reports candidates without making changes. Exits with code 1 if prunable items exist.
node okf-prune/scripts/prune.js --check [--bundle <path>]
node okf-prune/scripts/prune.js --dry-run
npm run okf:prune:check

# 2. Archive Mode (Default Safe Action)
# Moves matching concepts to archive/, marks status: deprecated, updates index.md, log.md, and viz.html.
node okf-prune/scripts/prune.js
npm run okf:prune

# 3. Permanent Deletion Mode
# Permanently removes candidate concept files from disk and cleans up index.md.
node okf-prune/scripts/prune.js --delete

# 4. Filtered Pruning
# Target specific categories instead of all prunable concepts:
node okf-prune/scripts/prune.js --stale       # Only expired stale_after concepts
node okf-prune/scripts/prune.js --deprecated  # Only status: deprecated concepts
node okf-prune/scripts/prune.js --ghosts      # Only concepts with missing local resource/source/computation files
node okf-prune/scripts/prune.js --orphans     # Only unlinked / isolated concepts

# 5. Machine-Readable JSON Output
node okf-prune/scripts/prune.js --check --json
```

## Quick Reference

| Command / Flag | Action | Modifies Files? | Exit Code |
|---|---|---|---|
| `--check` / `--dry-run` | Audits bundle for prunable concepts | No | 0 if clean, 1 if candidates found |
| `--archive` (default) | Moves concepts to `archive/`, sets `status: deprecated`, updates `index.md`, `log.md`, `viz.html` | Yes | 0 |
| `--delete` | Permanently deletes files, cleans `index.md` & `log.md` | Yes | 0 |
| `--stale` | Targets only concepts where `now >= stale_after` | Condition-dependent | 0 / 1 |
| `--deprecated` | Targets only concepts with `status: deprecated` | Condition-dependent | 0 / 1 |
| `--ghosts` | Targets concepts whose local `resource`, `sources`, `computation`, `executor`, or `attester` files are missing | Condition-dependent | 0 / 1 |
| `--orphans` | Targets concepts with 0 incoming links (including transitive orphans) | Condition-dependent | 0 / 1 |
| `--json` | Emits structured JSON result | Same as mode | 0 / 1 |

## Pruning Criteria & Rules

1. **Expired Concepts (`--stale`, §5.5)**
   - Concept has a `stale_after` timestamp in frontmatter.
   - Evaluated as `Date.now() >= new Date(stale_after).getTime()`.
   - Action: Archive or re-verify.

2. **Deprecated Concepts (`--deprecated`, §5.4)**
   - Concept frontmatter contains `status: deprecated`.
   - Per OKF v0.2 §5.4, deprecated concepts are kept for history and links but should not remain in active concept listings.
   - Action: Move to `archive/` subfolder and update `index.md` listing.

3. **Ghost Concepts (`--ghosts`, §6.2 & §10.2)**
   - Concept has a local path in `resource`, `sources` (string or `{ resource }` object), `computation`, `executor.resource`, or `attester.resource` whose file has been deleted from the repository. External URI schemes (`https://`, `bigquery://`, `gs://`, etc.) and scope descriptors (§5.1) are excluded.
   - Action: Clean up or archive to prevent drift errors.

4. **Orphaned Concepts (`--orphans`, §5.1 & §6.1)**
   - Concept has 0 inbound links across `index.md`, active concept markdown bodies (outside code blocks), and `sources` concept lineage references.
   - Action: Archive or link into the concept hierarchy.
