---
type: Concept
title: Interactive Simulator & Playbook
description: A self-contained HTML brief and token efficiency calculator explaining OKF savings.
resource: index.html
tags: [simulation, onboarding, visual-brief, playground]
generated:
  by: Antigravity/4.0
  at: 2026-11-11T13:19:32.743Z
sources:
  - scripts/sync-skills.js
---

# Overview
The `index.html` file acts as an interactive simulator and playbook. It provides a visual, zero-dependency breakdown of all 11 steps of [The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md) and an ongoing token efficiency calculator.

# Key Features
- **Pure CSS Interactive Pipeline (Steps 01–11)**: Toggles active detail cards and code tabs (`#toggle-step-1` through `#toggle-step-11`) for all pipeline steps and all 7 consolidated OKF skills (`okf`, `okf-wayfinder`, `okf-query`, `okf-maintain`, `okf-lint`, `okf-visualize`, `okf-learn`, with `okf-maintain` powering Steps 06, 09 `--upgrade`, and 10 `--prune`) using pure CSS selectors (`:checked ~`), working without JavaScript.
- **Automated Live Skill Snippet Synchronization**: Kept 100% synchronized with live `SKILL.md` and script files across all skills via [`scripts/sync-skills.js`](/scripts/sync-skills.js) (`npm run okf:sync` and `npm run okf:sync:check`), governed by [Skill Lifecycle & Documentation Synchronization Playbook](/concepts/skill-catalog-sync.md) and invoked automatically by [OKF Maintain Skill](/concepts/okf-maintain-skill.md).
- **Token Efficiency Simulator**: Calculates ongoing token consumption rates for traditional search exploration versus OKF-guided progressive disclosures on both legacy and greenfield codebases.
- **Workflow Playbooks**: Outlines setup steps and strategies for deploying OKF in different project scopes.
