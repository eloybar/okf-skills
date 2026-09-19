---
type: Skill
title: OKF Maintain Skill
description: Automatically validates OKF concept bundles and ensures code changes don't rot the documentation.
resource: file:///D:/projects/okf-skills/okf-maintain/SKILL.md
tags: [maintenance, automation, sync]
generated:
  by: Antigravity/3.5-Flash
  at: 2026-09-19T13:20:35.090Z
---

# Overview
The `okf-maintain` skill runs post-edit to verify that codebase modifications match the state of OKF concepts. It provides both an automated CLI maintenance script ([`maintain.js`](/okf-maintain/scripts/maintain.js)) for rapid mechanical upkeep and guided workflows for authoring new concepts when architecture changes.

# Architecture & CLI Automation
- **Script**: Located at [`okf-maintain/scripts/maintain.js`](/okf-maintain/scripts/maintain.js).
- **Execution Modes**:
  - `node okf-maintain/scripts/maintain.js` (or `npm run okf:maintain`): Automatically detects concept-resource drift via Git timestamps and refreshes `generated.at`, auto-heals outdated agent steering notices (`AGENTS.md` / `CLAUDE.md`) to the current version template without user prompting, scans for unindexed frontier files and updates `## Not yet specified` in `index.md`, appends entries to `log.md`, regenerates `viz.html`, and verifies with `okf-lint`.
  - `node okf-maintain/scripts/maintain.js --check`: Non-destructive audit mode that exits with code 1 if drift, unindexed frontier files, or outdated steering notices are found.
  - `node okf-maintain/scripts/maintain.js --json`: Outputs structured JSON for CI and subagent tooling.

# Workflow
1. **Guard check**: Verifies the bundle directory exists (in this repo, `/docs/okf`).
2. **Scan changes**: Maps modified or newly added code files, API routes, or database schemas to OKF concepts.
3. **Update concepts**: Updates frontmatter metadata (especially the `generated` block) and documents new facts/schemas.
4. **Scale & Refactor Links**: Detects scale transitions (from flat to nested when concept count passes 10) and refactors all relative link references accordingly.
5. **Update reserved files**: Appends to `log.md` and indexes new files/directories in `index.md`.
6. **Verify conformance**: Ensures all concept files carry a valid `type` in their YAML frontmatter.
