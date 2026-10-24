---
type: Skill
title: OKF Query Skill
description: Performs search and resource-based context retrieval to inject concepts into agent prompts.
resource: file:///D:/projects/okf-skills/okf-query/SKILL.md
tags: [retrieval, search, RAG, prompt-injection]
generated:
  by: Antigravity/4.0
  at: 2026-10-24T04:27:42.043Z
sources:
  - okf-query/scripts/query.js
---

# Overview
The `okf-query` skill retrieves context from the OKF bundle to inject it directly into the prompt of developers or active coding agents, closing the gap between writing and using documentation.

# Operation Modes
- **File Matching (`--file <path>`)**: Checks the `resource` and `sources` fields (supporting both shorthand string arrays and `{ type, resource }` object arrays) across all concepts. If a concept's resource maps to the queried file path, an enclosing parent directory (Tier 1), or resides within the same subsystem/directory (Tier 2), it fetches the concept content. Falls back to search suggestions if no direct concept is found.
- **Keyword Search (`--search <query>`)**: Scans all concepts' frontmatter fields (`title`, `description`, `tags`, `type`, `resource`, `sources`) and body content for the specified query, returning all matches.
- **Output**: Formats the selected concepts into a clean markdown context block suitable for prompt ingestion.
