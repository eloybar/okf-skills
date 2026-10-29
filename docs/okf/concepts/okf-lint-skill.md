---
type: Skill
title: OKF Lint Skill
description: Statically analyzes the OKF bundle to verify conformance, link integrity, and concept drift.
resource: file:///D:/projects/okf-skills/okf-lint/SKILL.md
tags: [linter, verification, quality-gate, CI-CD]
generated:
  by: Antigravity/4.0
  at: 2026-10-29T13:41:01.624Z
sources:
  - okf-lint/scripts/lint.js
---

# Overview
The `okf-lint` skill is a static analysis tool that guarantees documentation quality and prevents concept-code drift at the repository level.

# Verification Steps
- **Conformance**: Checks that every concept has parseable frontmatter and a valid `type`.
- **Link Integrity**: Checks that all internal markdown links (`[Label](/concepts/target.md)`) target files that exist. Strips code ticks and fenced code blocks first to ignore code examples.
- **Concept Drift (`--drift`)**: Compares the `generated.at` timestamp (falling back to legacy `timestamp`) in each concept with the latest modification timestamp of associated `resource` and `sources` paths (supporting both string and object entries, and checking both `git log -1` and uncommitted working-tree/staged `mtime` via `git status --porcelain`). Also emits a `[Drift Warning]` if any modified/added workspace code file is not bound to any concept's `resource` or `sources` frontmatter.
- **Freshness & Stale Concepts**: Validates the optional `stale_after` timestamp instant (§5.4). Emits a warning when the current date has surpassed the concept's `stale_after` date, flagging that the concept needs re-verification.
- **Agent Steering Notice Auditing**: Audits all present agent steering files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `GEMINI.md`) in the workspace root for outdated steering templates (v1.8.0) or missing Pre-Work Grounding Gates, Model-Tier Routing, or Pre-Completion Verification Gates.
- **Machine-Readable Output (`--json`)**: Emits structured JSON summary metrics for automated CI/CD pipelines and agent reasoning.
