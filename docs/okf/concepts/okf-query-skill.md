---
type: Skill
title: OKF Query Skill
description: Performs search and resource-based context retrieval to inject concepts into agent prompts.
resource: file:///D:/projects/okf-skills/okf-query/SKILL.md
tags: [retrieval, search, RAG, prompt-injection]
generated:
  by: Antigravity/4.0
  at: 2026-11-05T01:58:58.107Z
sources:
  - okf-query/scripts/query.js
---

# Overview
The `okf-query` skill retrieves context from the OKF bundle to inject it directly into the prompt of developers or active coding agents, closing the gap between writing and using documentation.

# Operation Modes
- **File Matching (`--file <path>`)**: Checks `resource`, `sources` (supporting both shorthand string arrays and structured object arrays, decoding percent-encoded `file://` URIs, stripping `#fragment`/`?query` suffixes, and ignoring non-path schemes like `git:<sha>:<path>`), `computation`, `executor.resource`, and `attester.resource` across all active concepts (skipping `archive/`). Ranks primary resource bindings (`resource`, `computation`, `executor.resource`, `attester.resource`) ahead of secondary `sources` bindings, falls back to path-suffix and basename matching when a queried relative path does not exist on disk, and then falls back to Tier 2 subsystem/directory matching.
- **Keyword Search (`--search <query>`)**: Scans all active concepts' frontmatter fields (`title`, `description`, `tags`, `type`, `resource`, `sources` strings/objects/authors/ids, `runtime`, `computation`, `executor.resource`, `attester.resource`), relative file paths, and body content for the specified query. Supports exact phrase matching and header-weighted multi-word tokenized ranking (`tokenizeSearchQuery`), falling back to concepts matching at least half (minimum 2) of the query tokens when no concept contains every token, and resolves `workspaceRoot` from `--bundle <path>` when querying an external repository.
- **Output**: Formats the selected concepts (including `File`, `Runtime`, and `Computation` metadata when present) into a clean markdown context block suitable for prompt ingestion. Renders all primary `--file` concepts (and up to 3 total `--file` concepts or top 5 `--search` concepts) in full while compacting additional secondary/lower-ranked matches to metadata headers unless `--full` is passed. Concepts larger than 12,000 characters automatically output a section outline plus matching `--search` sections (or a 12,000-character excerpt) unless `--full` is passed.
- **Passive Telemetry**: Records zero-token execution telemetry (`matchCount`, `matchTiers`, `outputBytes`, `durationMs`, and `query_miss`/`fallback_used`/`context_bloat`/`slow_exec` anomalies) to `~/.okf/telemetry.jsonl` (`recordTelemetry`).
