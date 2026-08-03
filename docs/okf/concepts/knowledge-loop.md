---
type: Concept
title: The Knowledge Loop Lifecycle
description: The closed-loop process of bootstrapping, steering, maintaining, and visualizing codebase knowledge.
resource: file:///D:/projects/okf-skills/README.md
tags: [architecture, loop, feedback]
generated:
  by: human:blub0x
  at: 2026-08-03T23:18:00Z
---

# Overview
The knowledge loop lifecycle binds the OKF skills together into a continuous self-documenting pipeline:

1. **OKF Specification**: Defined by [OKF Core Skill](/concepts/okf-skill.md).
2. **Initial Bundle Creation**: Bootstraps the concept files and directory structure using [OKF Core Skill](/concepts/okf-skill.md).
3. **Guided Wizard Onboarding**: Guided by the [OKF Wayfinder Skill](/concepts/okf-wayfinder-skill.md) to interview developers and capture tribal knowledge.
4. **AGENTS.md Steering**: Directs new agent sessions to check, read, and respect concepts.
5. **Context Retrieval**: Runs [OKF Query Skill](/concepts/okf-query-skill.md) to automatically fetch and inject relevant concepts into agent prompts.
6. **Model-Invoked Maintenance**: Automated post-edit checks run by [OKF Maintain Skill](/concepts/okf-maintain-skill.md) to update and validate concepts.
7. **CI Quality & Drift Gate**: Uses [OKF Lint Skill](/concepts/okf-lint-skill.md) to statically analyze files and block PRs on broken links or un-synced concept drift.
8. **Interactive Visualization**: Formulated by [OKF Visualize Skill](/concepts/okf-visualize-skill.md), allowing human-in-the-loop audit of the knowledge graph.

# Purpose
By keeping documentation aligned with actual code state at commit/lifecycle boundaries, this workflow mitigates cold-starts for new agents or team members, enables token-efficient context retrieval, and completely eliminates documentation rot.
