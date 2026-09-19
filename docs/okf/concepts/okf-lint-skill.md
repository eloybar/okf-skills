---
type: Skill
title: OKF Lint Skill
description: Statically analyzes the OKF bundle to verify conformance, link integrity, and concept drift.
resource: file:///D:/projects/okf-skills/okf-lint/SKILL.md
tags: [linter, verification, quality-gate, CI-CD]
generated:
  by: Antigravity/3.5-Flash
  at: 2026-09-19T13:03:00Z
---

# Overview
The `okf-lint` skill is a static analysis tool that guarantees documentation quality and prevents concept-code drift at the repository level.

# Verification Steps
- **Conformance**: Checks that every concept has parseable frontmatter and a valid `type`.
- **Link Integrity**: Checks that all internal markdown links (`[Label](/concepts/target.md)`) target files that exist. Strips code ticks and fenced code blocks first to ignore code examples.
- **Concept Drift (`--drift`)**: Compares the `generated.at` timestamp (falling back to legacy `timestamp`) in each concept with the Git last modified timestamp of the associated `resource` path. If the code file is newer than the documentation timestamp, it flags a warning to run `okf-maintain` to sync.
- **Freshness & Stale Concepts**: Validates the optional `stale_after` timestamp instant (§5.4). Emits a warning when the current date has surpassed the concept's `stale_after` date, flagging that the concept needs re-verification.
- **Agent Steering Notice Auditing**: Audits all present agent steering files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `GEMINI.md`) in the workspace root for outdated steering templates or missing Pre-Completion Verification Gates.
- **Machine-Readable Output (`--json`)**: Emits structured JSON summary metrics for automated CI/CD pipelines and agent reasoning.
