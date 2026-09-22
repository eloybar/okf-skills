---
name: okf-prune
description: Use when an OKF bundle contains stale, expired, deprecated, orphaned, or dangling concepts that need pruning, archiving, or cleanup.
version: 1.0.0
---

# `okf-prune` Workflow

Maintain knowledge bundle hygiene through automated concept lifecycle pruning, archiving, and garbage collection.

## Overview

Over the lifecycle of a codebase, concepts change:
- Features are deprecated or removed (`status: deprecated`).
- Temporary contracts or deadlines expire (`stale_after`).
- Underlying source code files are deleted, leaving ghost concepts with missing `resource` files.
- Concepts become disconnected and orphaned with 0 inbound links.

`okf-prune` systematically audits the bundle, identifies candidates for removal or archiving, moves them safely to `archive/` (or permanently deletes them), updates `index.md`, and logs the changes in `log.md`.

## Usage

```bash
# 1. Audit / Check Mode (Read-Only)
# Scans bundle and reports candidates without making changes. Exits with code 1 if prunable items exist.
node okf-prune/scripts/prune.js --check
node okf-prune/scripts/prune.js --dry-run
npm run okf:prune:check

# 2. Archive Mode (Default Safe Action)
# Moves matching concepts to archive/, marks status: deprecated, updates index.md and log.md.
node okf-prune/scripts/prune.js
npm run okf:prune

# 3. Permanent Deletion Mode
# Permanently removes candidate concept files from disk and cleans up index.md.
node okf-prune/scripts/prune.js --delete

# 4. Filtered Pruning
# Target specific categories instead of all prunable concepts:
node okf-prune/scripts/prune.js --stale       # Only expired stale_after concepts
node okf-prune/scripts/prune.js --deprecated  # Only status: deprecated concepts
node okf-prune/scripts/prune.js --ghosts      # Only concepts with missing resource files
node okf-prune/scripts/prune.js --orphans     # Only unlinked / isolated concepts

# 5. Machine-Readable JSON Output
node okf-prune/scripts/prune.js --check --json
```

## Quick Reference

| Command / Flag | Action | Modifies Files? | Exit Code |
|---|---|---|---|
| `--check` / `--dry-run` | Audits bundle for prunable concepts | No | 0 if clean, 1 if candidates found |
| `--archive` (default) | Moves concepts to `archive/`, sets `status: deprecated`, updates `index.md` and `log.md` | Yes | 0 |
| `--delete` | Permanently deletes files, cleans `index.md` & `log.md` | Yes | 0 |
| `--stale` | Targets only concepts where `now >= stale_after` | Condition-dependent | 0 / 1 |
| `--deprecated` | Targets only concepts with `status: deprecated` | Condition-dependent | 0 / 1 |
| `--ghosts` | Targets concepts whose local resource/source files are missing | Condition-dependent | 0 / 1 |
| `--orphans` | Targets concepts with 0 incoming links in the bundle | Condition-dependent | 0 / 1 |
| `--json` | Emits structured JSON result | Same as mode | 0 / 1 |

## Pruning Criteria & Rules

1. **Expired Concepts (`--stale`)**
   - Concept has a `stale_after` timestamp in frontmatter.
   - Evaluated as `Date.now() >= new Date(stale_after).getTime()`.
   - Action: Archive or re-verify.

2. **Deprecated Concepts (`--deprecated`)**
   - Concept frontmatter contains `status: deprecated`.
   - Per OKF v0.2 §5.4, deprecated concepts are kept for history and links but should not remain in active concept listings.
   - Action: Move to `archive/` subfolder and update `index.md` listing.

3. **Ghost Concepts (`--ghosts`)**
   - Concept has a local `resource` URI (e.g. `file:///path/to/file` or local relative path) or `sources` entry whose file has been deleted from the repository.
   - Action: Clean up or archive to prevent drift errors.

4. **Orphaned Concepts (`--orphans`)**
   - Concept has 0 inbound links across all bundle markdown files (`index.md` and all other concept files).
   - Action: Archive or link into the concept hierarchy.

## Common Mistakes

- **Deleting instead of archiving when external links or Git history rely on the concept**: Default to `--archive` to preserve the concept under `archive/` with `status: deprecated` instead of deleting.
- **Forgetting to update `index.md`**: `prune.js` automatically manages moving items into the `## Archived Concepts` section of `index.md`.
- **Relying purely on manual checks**: Incorporate `okf-prune --check` into CI workflows or regular maintenance cycles to prevent unpruned rot.
