---
type: Skill
title: OKF Query Skill
description: Performs search and resource-based context retrieval to inject concepts into agent prompts.
resource: file:///D:/projects/okf-skills/okf-query/SKILL.md
tags: [retrieval, search, RAG, prompt-injection]
generated:
  by: Antigravity/4.0
  at: 2026-11-04T17:44:29.668Z
sources:
  - okf-query/scripts/query.js
---

# Overview
The `okf-query` skill retrieves context from the OKF bundle to inject it directly into the prompt of developers or active coding agents, closing the gap between writing and using documentation.

# Operation Modes
- **File Matching (`--file <path>`)**: Checks `resource`, `sources` (supporting both shorthand string arrays and structured object arrays, decoding percent-encoded `file://` URIs, stripping `#fragment`/`?query` suffixes, and ignoring non-path schemes like `git:<sha>:<path>`), `computation`, `executor.resource`, and `attester.resource` across all active concepts (skipping `archive/`). If a concept's bound resource maps to the queried file path or an enclosing parent directory (Tier 1), or resides within the same subsystem/directory (Tier 2), it fetches the concept content. Falls back to search suggestions if no direct concept is found.
- **Keyword Search (`--search <query>`)**: Scans all active concepts' frontmatter fields (`title`, `description`, `tags`, `type`, `resource`, `sources` strings/objects/authors/ids, `runtime`, `computation`, `executor.resource`, `attester.resource`), relative file paths, and body content for the specified query. Supports both exact phrase matching and multi-word tokenized ranking (`tokenizeSearchQuery`), falling back to concepts matching at least half (minimum 2) of the query tokens when no concept contains every token, and resolves `workspaceRoot` from `--bundle <path>` when querying an external repository.
- **Output**: Formats the selected concepts (including `File`, `Runtime`, and `Computation` metadata when present) into a clean markdown context block suitable for prompt ingestion. Concepts larger than 12,000 characters automatically output a section outline plus matching `--search` sections (or a 12,000-character excerpt) unless `--full` is passed.
