---
type: Skill
title: OKF Maintain Skill
description: Automatically validates OKF concept bundles and ensures code changes don't rot the documentation.
resource: file:///D:/projects/okf-skills/okf-maintain/SKILL.md
tags: [maintenance, automation, sync]
timestamp: 2026-07-30T12:00:00Z
---

# Overview
The `okf-maintain` skill runs post-edit to verify that codebase modifications match the state of OKF concepts. It identifies affected concepts and forces updating them to prevent documentation rot.

# Workflow
1. **Guard check**: Verifies the bundle directory exists (in this repo, `/docs/okf`).
2. **Scan changes**: Maps modified or newly added code files, API routes, or database schemas to OKF concepts.
3. **Update concepts**: Updates frontmatter metadata (especially the `timestamp`) and documents new facts/schemas.
4. **Update reserved files**: Appends to `log.md` and indexes new files in `index.md`.
5. **Verify conformance**: Ensures all concept files carry a valid `type` in their YAML frontmatter.
