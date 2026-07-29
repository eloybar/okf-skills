---
type: Concept
title: The Knowledge Loop Lifecycle
description: The closed-loop process of bootstrapping, steering, maintaining, and visualizing codebase knowledge.
resource: file:///D:/projects/okf-skills/README.md
tags: [architecture, loop, feedback]
timestamp: 2026-07-29T22:12:34Z
---

# Overview
The knowledge loop lifecycle binds the three main OKF skills together into a continuous self-documenting pipeline:

1. **OKF Specification**: Defined by [OKF Core Skill](/concepts/okf-skill.md).
2. **Initial Bundle Creation**: Bootstraps the concept files and directory structure using [OKF Core Skill](/concepts/okf-skill.md).
3. **Guided Wizard Onboarding**: Guided by the [OKF Wayfinder Skill](/concepts/okf-wayfinder-skill.md) to interview developers and capture tribal knowledge.
4. **AGENTS.md Steering**: Directs new agent sessions to check, read, and respect concepts.
5. **Model-Invoked Maintenance**: Automated post-edit checks run by [OKF Maintain Skill](/concepts/okf-maintain-skill.md) to update and validate concepts.
6. **Interactive Visualization**: Formulated by [OKF Visualize Skill](/concepts/okf-visualize-skill.md), allowing human-in-the-loop audit of the knowledge graph.

# Purpose
By keeping documentation aligned with actual code state at commit/lifecycle boundaries, this workflow mitigates cold-starts for new agents or team members, enables token-efficient context retrieval, and completely eliminates documentation rot.
