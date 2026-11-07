---
type: Skill
title: OKF Lint Skill
description: Statically analyzes the OKF bundle to verify conformance, link integrity, and concept drift.
resource: okf-lint/SKILL.md
tags: [linter, verification, quality-gate, CI-CD]
generated:
  by: Antigravity/4.0
  at: 2026-11-07T16:09:03.827Z
sources:
  - okf-lint/scripts/lint.js
---

# Overview
The `okf-lint` skill is a static analysis tool that guarantees documentation quality and prevents concept-code drift at the repository level in compliance with OKF Specification v0.2.

# Verification Steps
- **Conformance & Lifecycle Validation**: Checks that every concept has parseable frontmatter, a valid `type`, and (if present) a valid lifecycle `status` (`draft | stable | deprecated`, §5.4).
- **Provenance & Footnote Attribution (§5.1, §7)**: Validates structured `sources` objects (`resource` required, `sources[].author` actor format without `agent:` prefix) and checks that any `sources[].id` defined for inline attribution is referenced by a matching `[^id]` footnote in the Markdown body (and vice versa).
- **Attested Computation Verification (§10)**: Validates `runtime`, `computation`, `executor`, and `attester` metadata on `Attested Computation` concepts, and warns if neither a frontmatter `computation` URI nor an inline `# Computation` section is provided (§10.3).
- **Link Integrity**: Checks that all internal markdown links (`[Label](/concepts/target.md)`) target files that exist. Strips fenced code blocks and inline code spans that wrap full markdown links while unwrapping backtick-formatted link labels (e.g. `` [`GatewayService/okf/`](...) ``) before bare-label checks.
- **Missing Local Resource Detection**: Warns when an active (non-deprecated) concept binds a local `resource:` or `sources:` file path that does not exist on disk (`Warning: Missing local resource`), catching deleted files or cross-branch drift immediately while decoding percent-encoded `file://` URIs (e.g. `%20`), stripping `#fragment`/`?query` suffixes, and ignoring non-path URI schemes such as `git:<sha>:<path>`.
- **Concept Drift (`--drift`)**: Compares the effective concept timestamp (the later of frontmatter `generated.at`/`timestamp` and, when the concept file is clean in the working tree, its Git commit timestamp via `getEffectiveConceptTime`, plus same-commit co-modification detection via `isCoModifiedInLatestCommit` so committing maintained concepts alongside bound files or directories never causes false post-commit drift) with the latest modification timestamp of associated `resource`, `sources` (string and object entries, resolving concept-to-concept dependencies against their effective frontmatter timestamp via `getResourceEffectiveModifiedISO` to prevent sub-second `writeFileSync` skew), `computation`, `executor.resource`, and `attester.resource` paths (checking both batched repository-wide `git log -m --format=__OKF_COMMIT__%H|%aI --name-only` via `getRepoCommitTimeMap` and batched uncommitted working-tree/staged `mtime` via `git -c core.quotepath=false status --porcelain -uall`, while exempting reserved bundle files `log.md`, `index.md`, and `viz.html` from triggering drift). Also emits a `[Drift Warning]` if any modified/added workspace code file is not bound to any concept, and resolves `workspaceRoot` from `--bundle <path>` when invoked outside the target repository.
- **Freshness & Stale Concepts**: Validates the optional `stale_after` timestamp instant (§5.4). Emits a warning when the current date has surpassed the concept's `stale_after` date, flagging that the concept needs re-verification.
- **Agent Steering Notice Auditing**: Audits all present agent steering files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `GEMINI.md`) in the workspace root for outdated steering templates (v1.8.2) or missing Pre-Work Grounding Gates, Model-Tier Routing, or Pre-Completion Verification Gates.
- **Machine-Readable Output (`--json`)**: Emits structured JSON summary metrics for automated CI/CD pipelines and agent reasoning, and records passive execution telemetry (`durationMs`, `errorsCount`, `warningsCount`, `driftCount`, and `slow_exec`/`lint_error` anomalies) to `~/.okf/telemetry.jsonl` (`recordTelemetry`).
