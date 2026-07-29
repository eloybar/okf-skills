---
name: okf-query
description: Scan the OKF knowledge bundle to retrieve and inject relevant architectural and business context matching specific files or search queries.
---

# `okf-query` Workflow

Retrieve matching OKF concepts to inject context directly into agent prompts.

## Usage

```bash
# Retrieve concept matching a specific codebase resource file
node okf-query/scripts/query.js --file install.ps1

# Search all concepts by tags or text keywords
node okf-query/scripts/query.js --search "maintenance"
```

## Steps

1. **Locate the Bundle**
   - Locate the OKF bundle root directory at `/docs/okf` or `/okf`.

2. **Match by File Path (`--file <path>`)**
   - Take a file path as input and resolve it relative to the workspace root.
   - Scan all concept files and parse their `resource` values.
   - If a concept's `resource` target path matches the input file path (or matches a directory containing the input file path), select it.

3. **Match by Text Search (`--search <query>`)**
   - Look for occurrences of the search term inside concept titles, tags, descriptions, and markdown body text.

4. **Consolidated Output**
   - Output selected concepts formatted as a single markdown context block suitable for prompt injection.
