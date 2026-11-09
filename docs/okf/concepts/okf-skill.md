---
type: Skill
title: OKF Core Skill
description: Core skill that defines the structure and authoring guidelines of Open Knowledge Format (OKF) concept files.
resource: okf/SKILL.md
tags: [core, okf, documentation]
generated:
  by: Antigravity/4.0
  at: 2026-11-09T20:51:35.884Z
sources:
  - AGENTS.md
---

# Overview
The `okf` skill defines the Open Knowledge Format (OKF) rules for writing self-documenting codebases, directly implementing the [OKF Specification v0.2](/concepts/okf-specification.md). It serves as the single source of truth for how a concept is authored, linked, structured, and organized.

# Key Features
- **YAML Frontmatter**: Requires `type`, recommends `title`, `description`, `resource`, `tags`, `status`, `stale_after`, `generated`, `verified`, and `sources` (both shorthand string lists and structured provenance objects).
- **Bundle Directory**: In this repository, it is located at `/docs/okf`.
- **Cross-linking & Anti-Regression Checklists**: Uses bundle-relative absolute paths to form an untyped concept dependency graph, and defines conventional body headings (`# Schema`, `# Examples`, `# Computation`, and `# Guardrails & Anti-Regression Checklist` for embedding lessons learned directly inside source-bound `Playbook`/`Subsystem` concepts).
- **Directory Organization**: Outlines how to transition from a flat layout to a nested directory structure as the concept count scales (>= 10 concepts).
- **Steering Notice (v1.8.2)**: Sets up agent steering files (e.g. `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`) with mandatory Pre-Work Grounding Gates (including Step 4: Model-Tier Routing, directing agents to use the **High** reasoning setting during bundle bootstrapping, domain discovery, and planning, then switch back to **Medium** for implementation) and 3-step Pre-Completion Verification Gates on the **Medium** setting (Step 1: Semantic Concept & Source Binding Upkeep, Step 2: Maintain, Step 3: Lint), rendered by the concise template in [OKF Maintain Skill](/concepts/okf-maintain-skill.md).
