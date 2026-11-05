---
type: Skill
title: OKF Learn Skill
description: Audits session transcripts and passive CLI telemetry to extract qualitative lessons and auto-remediate bundle and skill friction.
resource: okf-learn/SKILL.md
status: stable
tags: [self-improvement, telemetry, evaluation, learning]
generated:
  by: Antigravity/4.0
  at: 2026-11-05T19:49:17.956Z
sources:
  - okf-learn/scripts/learn.js
  - scripts/test-lifecycle.js
---

# Overview
The `okf-learn` skill closes the retrospective self-improvement loop in [The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md). While [OKF Maintain Skill](/concepts/okf-maintain-skill.md) performs mechanical post-edit synchronization, `okf-learn` inspects completed or active coding sessions (`transcript.jsonl`) alongside passive zero-token CLI telemetry (`~/.okf/telemetry.jsonl`) to surface and fix documentation and tooling friction.

# Architecture & CLI Modes
- **Script**: Located at [`okf-learn/scripts/learn.js`](/okf-learn/scripts/learn.js).
- **Session & Telemetry Audit (`node okf-learn/scripts/learn.js [<conversation-id> | --latest] [--brain-dir <path>] [--json]`)**:
  - **Gate Compliance**: Scores adherence to the 4 mandatory OKF Steering Gates (`sessionStartLint`, `preWorkQueries`, `conceptCitations`, `preCompletionMaintain`).
  - **Quantitative Friction**: Detects `queryMisses` (from both transcript outputs and `telemetry.jsonl`), `fallbacksUsed` (suffix/basename/directory rescues), `contextBloat` (`OKF CONTEXT BLOCK` outputs exceeding 40 KB), `slowCommands` (backgrounded OKF CLI commands), and `toolErrors` (`edit_file` target-not-found vs. missing files).
  - **Qualitative Learning Signals (`learningSignals`)**: Extracts corrective user turns (`userCorrections`) and identifies oversized active concepts (`oversizedConcepts` with body > 12 KB) in the bundle.
  - **Actionable Recommendations**: Synthesizes prioritized (`HIGH` / `MED` / `LOW`) remediation steps.
- **Auto-Binding Remediation (`node okf-learn/scripts/learn.js --bind <file> --concept <concept-rel-path>`)**:
  - Automatically adds a missed or newly discovered workspace file to the target concept's `sources:` frontmatter (preserving CRLF/LF line endings and refreshing `generated.at`) so future [OKF Query Skill](/concepts/okf-query-skill.md) `--file` lookups resolve at Tier 1.
- **Telemetry Reset (`node okf-learn/scripts/learn.js --reset`)**:
  - Clears `~/.okf/telemetry.jsonl` (or `OKF_TELEMETRY_PATH` / `--telemetry <path>`) when starting a clean benchmark window.
