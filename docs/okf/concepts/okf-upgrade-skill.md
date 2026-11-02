---
type: Skill
title: OKF Upgrade Skill
description: Automatically upgrades an OKF concept bundle from v0.1 to v0.2 specification.
resource: file:///D:/projects/okf-skills/okf-upgrade/SKILL.md
tags: [upgrade, migration, automation]
status: stable
generated:
  by: Antigravity/4.0
  at: 2026-11-02T17:38:56.619Z
sources:
  - okf-upgrade/scripts/upgrade.js
---

# Overview
The `okf-upgrade` skill automates the migration of legacy OKF bundles to the v0.2 specification, upgrading metadata formats, actor identifiers, and provenance citations while preserving existing v0.2 fields.

# Key Functions
- Converts legacy `timestamp` keys into structured `generated: { by, at }` properties and normalizes actor strings (stripping prohibited `agent:` prefixes in `generated.by`, `verified.by`, `executor.by`, `attester.by`, and `sources[].author` per §5.1, §7).
- Migrates inline body `# Citations` lists to frontmatter `sources` lists while preserving both v0.2 shorthand string sources and structured source objects (`id`, `resource`, `title`, `author`, `usage_count`, `last_modified`).
- Adds the root `okf_version: "0.2"` compatibility flag to `index.md` and normalizes `log.md` date headings to `## YYYY-MM-DD`.
- Supports custom bundle paths via `--bundle <path>`, skips archived concepts under `archive/`, and triggers post-migration lint validation.
