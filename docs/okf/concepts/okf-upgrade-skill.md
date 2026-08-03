---
type: Skill
title: OKF Upgrade Skill
description: Automatically upgrades an OKF concept bundle from v0.1 to v0.2 specification.
resource: file:///D:/projects/okf-skills/okf-upgrade/SKILL.md
tags: [upgrade, migration, automation]
status: stable
generated:
  by: human:blub0x
  at: 2026-08-03T19:00:00Z
---

# Overview
The `okf-upgrade` skill automates the migration of legacy OKF bundles to v0.2, upgrading metadata formats and citations.

# Key Functions
- Converts legacy `timestamp` keys into structured `generated: { by, at }` properties.
- Migrates inline body `# Citations` lists to frontmatter `sources` lists.
- Adds the root `okf_version: "0.2"` compatibility flag to the main index file.
- Triggers post-migration lint validation.
