---
type: Skill
title: OKF Upgrade Skill
description: Automatically upgrades an OKF concept bundle from v0.1 to v0.2 specification.
resource: okf-upgrade/SKILL.md
tags: [upgrade, migration, automation]
status: stable
generated:
  by: Antigravity/4.0
  at: 2026-11-04T18:19:08.560Z
sources:
  - okf-upgrade/scripts/upgrade.js
---

# Overview
The `okf-upgrade` skill automates the migration of legacy OKF bundles to the v0.2 specification, upgrading metadata formats, actor identifiers, and provenance citations while preserving existing v0.2 fields.

# Key Functions
- Converts legacy `timestamp` keys into structured `generated: { by, at }` properties and normalizes actor strings (stripping prohibited `agent:` prefixes in `generated.by`, `verified.by`, `executor.by`, `attester.by`, and `sources[].author` per §5.1, §7).
- Migrates inline body `# Citations` lists to frontmatter `sources` lists while preserving both v0.2 shorthand string sources and structured source objects (`id`, `resource`, `title`, `author`, `usage_count`, `last_modified`), automatically splits comma-separated local `resource:` paths into `resource` + `sources`, and unwraps backtick-formatted link labels when auto-fixing bare links.
- Enforces `okf_version: "0.2"` on root `index.md` while stripping legacy frontmatter keys (`type`, `title`, `description`, `generated`) per §12, normalizes both `## YYYY-MM-DD` and bullet-dated (`- **YYYY-MM-DD** — ...`) `log.md` entries to `## YYYY-MM-DD` sections, and preserves native CRLF/LF line endings across all files.
- Supports custom and sub-package bundle paths via `--bundle <path>`, skips archived concepts under `archive/`, triggers post-migration lint validation, and provides multi-agent skill self-updating (`--skills` / `--self` / `--all`) across Google Antigravity (`~/.gemini/config/skills`), Claude Code profiles (`~/.claude/skills`, `~/.claude-*/skills`, `$CLAUDE_CONFIG_DIR/skills`), OpenAI Codex profiles (`~/.codex/skills`, `~/.codex-*/skills`, `$CODEX_HOME/skills`), and universal `.agents/skills` (while fast-forwarding `~/okf-skills` when present).
