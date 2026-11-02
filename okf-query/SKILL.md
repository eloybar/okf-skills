---
name: okf-query
description: Scan the OKF knowledge bundle to retrieve and inject relevant architectural and business context matching specific files or search queries.
version: 1.8.2
---

# `okf-query` Workflow

Retrieve matching OKF v0.2 concepts to inject architectural contracts, provenance, and trust signals directly into agent prompts.

## Usage

```bash
# Retrieve concept matching a specific codebase resource, source, or attested computation file
node okf-query/scripts/query.js --file install.ps1 [--bundle <path>]

# Search all concepts by tags, provenance metadata, runtime, or text keywords
node okf-query/scripts/query.js --search "maintenance" [--bundle <path>]
```

## Steps

1. **Locate the Bundle**
   - Locate the OKF bundle root directory at `/docs/okf` or `/okf` (or via `--bundle <path>`), skipping `archive/` directories so only active concepts are injected.

2. **Match by File Path (`--file <path>`)**
   - Take a file path as input and resolve it relative to the workspace root.
   - Scan all active concept files and inspect all OKF v0.2 §6.2 path-valued fields: `resource`, `sources` (both shorthand string arrays and `{ id, resource, title, ... }` objects), `computation`, `executor.resource`, and `attester.resource`.
   - **Tier 1 (Direct / Enclosing Match):** Select any concept whose bound path matches the queried file or an enclosing parent directory.
   - **Tier 2 (Subsystem / Directory Match):** If no Tier 1 match exists, select concepts that document sibling files in the same module/directory.
   - If no concept is found, output actionable guidance suggesting search keywords or the catalog index.

3. **Match by Text Search (`--search <query>`)**
   - Scan concept `title`, `description`, `type`, `runtime`, `tags`, `resource`, `sources` (`id`, `resource`, `title`, `author`), `computation`, `executor.resource`, `attester.resource`, and markdown body text.

4. **Consolidated Output**
   - Output selected concepts formatted as an `=== OKF CONTEXT BLOCK ===` including `Type`, `Description`, `Resource`, `Runtime`/`Computation` (for `Attested Computation`), `Tags`, `Status`, `Stale After`, derived `Trust Tier` (`unverified`, `machine-confirmed`, or `human-reviewed` per §5.3), and body content.
