---
type: Skill
title: OKF Core Skill
description: Core skill that defines the structure and authoring guidelines of Open Knowledge Format (OKF) concept files.
resource: file:///D:/projects/okf-skills/okf/SKILL.md
tags: [core, okf, documentation]
generated:
  by: human:blub0x
  at: 2026-08-03T14:00:00Z
---

# Overview
The `okf` skill defines the Open Knowledge Format (OKF) rules for writing self-documenting codebases. It serves as the single source of truth for how a concept is authored, linked, structured, and organized.

# Key Features
- **YAML Frontmatter**: Requires `type`, recommends `title`, `description`, `resource`, `tags`, and `timestamp`.
- **Bundle Directory**: In this repository, it is located at `/docs/okf`.
- **Cross-linking**: Uses bundle-relative absolute paths to form an untyped concept dependency graph.
- **Directory Organization**: Outlines how to transition from a flat layout to a nested directory structure as the concept count scales (>= 10 concepts).
- **Steering Notice**: Sets up `AGENTS.md` (or `CLAUDE.md`) to guide autonomous agents to read/maintain the bundle.
