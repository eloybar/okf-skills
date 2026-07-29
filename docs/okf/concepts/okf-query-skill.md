---
type: Skill
title: OKF Query Skill
description: Performs search and resource-based context retrieval to inject concepts into agent prompts.
resource: file:///D:/projects/okf-skills/okf-query/SKILL.md
tags: [retrieval, search, RAG, prompt-injection]
timestamp: 2026-07-29T22:37:00Z
---

# Overview
The `okf-query` skill retrieves context from the OKF bundle to inject it directly into the prompt of developers or active coding agents, closing the gap between writing and using documentation.

# Operation Modes
- **File Matching (`--file <path>`)**: Checks the `resource` field of all concepts. If a concept's resource maps to the queried file path or a parent directory, it fetches the concept content.
- **Keyword Search (`--search <query>`)**: Scans all concepts' frontmatter fields (title, description, tags, type) and body content for the specified query, returning all matches.
- **Output**: Formats the selected concepts into a clean markdown context block suitable for prompt ingestion.
