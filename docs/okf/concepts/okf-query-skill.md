---
type: Skill
title: OKF Query Skill
description: Performs search and resource-based context retrieval to inject concepts into agent prompts.
resource: okf-query/SKILL.md
tags: [retrieval, search, RAG, prompt-injection]
generated:
  by: Antigravity/4.0
  at: 2026-11-02T00:26:24.197Z
sources:
  - okf-query/scripts/query.js
---

# Overview
The `okf-query` skill retrieves context from the OKF bundle to inject it directly into the prompt of developers or active coding agents, closing the gap between writing and using documentation.

# Operation Modes
- **File Matching (`--file <path>`)**: Checks `resource`, `sources` (supporting both shorthand string arrays and structured object arrays), `computation`, `executor.resource`, and `attester.resource` across all active concepts (skipping `archive/`). If a concept's bound resource maps to the queried file path or an enclosing parent directory (Tier 1), or resides within the same subsystem/directory (Tier 2), it fetches the concept content. Falls back to search suggestions if no direct concept is found.
- **Keyword Search (`--search <query>`)**: Scans all active concepts' frontmatter fields (`title`, `description`, `tags`, `type`, `resource`, `sources` strings/objects/authors/ids, `runtime`, `computation`, `executor.resource`, `attester.resource`) and body content for the specified query, returning all matches.
- **Output**: Formats the selected concepts (including `Runtime` and `Computation` metadata when present) into a clean markdown context block suitable for prompt ingestion.
