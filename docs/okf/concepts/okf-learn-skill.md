---
type: Skill
title: OKF Learn Skill
description: Audits session transcripts and passive CLI telemetry to extract qualitative lessons and auto-remediate bundle and skill friction.
resource: okf-learn/SKILL.md
status: stable
tags: [self-improvement, telemetry, evaluation, learning]
generated:
  by: Antigravity/4.0
  at: 2026-11-06T13:40:25.381Z
sources:
  - okf-learn/scripts/learn.js
  - scripts/test-lifecycle.js
---

# Overview
The `okf-learn` skill closes the retrospective self-improvement loop in [The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md). While [OKF Maintain Skill](/concepts/okf-maintain-skill.md) performs mechanical post-edit synchronization, `okf-learn` inspects completed or active coding sessions (`transcript.jsonl`) alongside passive zero-token CLI telemetry (`~/.okf/telemetry.jsonl`) and cross-repo skill learning notes (`~/.okf/skill-learnings.jsonl`) to surface and fix documentation and tooling friction.

# Architecture & CLI Modes
- **Script**: Located at [`okf-learn/scripts/learn.js`](/okf-learn/scripts/learn.js).
- **Session & Telemetry Audit (`node okf-learn/scripts/learn.js [<conversation-id> | --latest] [--recent [N]] [--exclude <id>] [--brain-dir <path>] [--json]`)**:
  - **Smart `--latest` & Multi-Runtime Discovery**: Discovers transcripts across both Gemini Antigravity (`~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`) and Claude Code (`~/.claude/projects/<slug>/<session-id>.jsonl`, `~/.claude-*/projects/`, `$CLAUDE_CONFIG_DIR/projects/`), auto-detects the transcript format (`antigravity` or `claude-code`, deduplicating Claude Code assistant `message.usage` token counts by `message.id`), and emits an explicit `conversation.warning` when a requested transcript is missing or has an unrecognized schema. When `--latest` is passed without an explicit conversation ID, `evaluateSkillsPerformance` automatically skips short `<6` step meta-sessions in favor of the most recent substantive coding session (`>= 6` steps), and `--recent [N]` summarizes the last `N` (default `5`) substantive sessions across all workspaces (`inferredWorkspace` resolved via `record.cwd` or `inferWorkspaceFromPath`, gate score, and friction).
  - **Gate Compliance**: Scores adherence to the 4 mandatory OKF Steering Gates (`sessionStartLint`, `preWorkQueries` including `okf/index.md` reads, `conceptCitations`, `preCompletionMaintain`).
  - **Quantitative Friction**: Detects `queryMisses` (from both transcript command outputs and `telemetry.jsonl`, excluding `read_file`/`Read` outputs), `fallbacksUsed` (suffix/basename/directory rescues), `contextBloat` (conversation-scoped `OKF CONTEXT BLOCK` outputs exceeding 40 KB), `slowCommands` (backgrounded OKF CLI commands), and `toolErrors` (`edit_file` target-not-found vs. missing files).
  - **Qualitative Learning Signals (`learningSignals`)**: Extracts corrective user turns (`userCorrections`, filtering out `isMeta: true` / `isSidechain: true` records, `tool_result` outputs, injected `SKILL.md` expansions starting with `Base directory for this skill:`, `<command-name>` blocks, `<pasted_content>` logs, and fenced code blocks via `sanitizeUserTurnText`) and identifies oversized active concepts (`oversizedConcepts` with body > 12 KB) in the bundle.
  - **Cross-Repo Skill Learnings Queue (`skillLearningsQueue`)**: Reads queued skill-level findings from `~/.okf/skill-learnings.jsonl` (overridable via `OKF_SKILL_LEARNINGS_PATH` or `--learnings`) and synthesizes a `HIGH` priority `skill-backlog` recommendation when entries exist.
  - **Actionable Recommendations**: Synthesizes prioritized (`HIGH` / `MED` / `LOW`) remediation steps.
- **Auto-Binding Remediation (`node okf-learn/scripts/learn.js --bind <file> --concept <concept-rel-path>`)**:
  - Automatically adds a missed or newly discovered workspace file to the target concept's `sources:` frontmatter (preserving CRLF/LF line endings and refreshing `generated.at`) so future [OKF Query Skill](/concepts/okf-query-skill.md) `--file` lookups resolve at Tier 1.
- **Cross-Repo Skill Note Queueing (`node okf-learn/scripts/learn.js --note "<message>" [--skill <name>] [--category <cat>]`)**:
  - Appends a structured skill improvement item (`{ timestamp, workspaceRoot, skill, category, message }`) to `~/.okf/skill-learnings.jsonl` during any external project session so it can be applied inside the `okf-skills` repository.
- **Queue & Telemetry Reset (`node okf-learn/scripts/learn.js --clear-notes | --reset`)**:
  - `--clear-notes` empties `~/.okf/skill-learnings.jsonl` after skill improvements are applied; `--reset` clears both `~/.okf/telemetry.jsonl` and `~/.okf/skill-learnings.jsonl`.
