---
type: Concept
title: Interactive Simulator & Playbook
description: A self-contained HTML brief and token efficiency calculator explaining OKF savings.
resource: file:///D:/projects/okf-skills/index.html
tags: [simulation, onboarding, visual-brief, playground]
generated:
  by: Antigravity/4.0
  at: 2026-11-04T14:13:56.028Z
sources:
  - scripts/sync-skills.js
---

# Overview
The `index.html` file acts as an interactive simulator and playbook. It provides a visual, zero-dependency breakdown of the OKF pipeline lifecycle and an ongoing token efficiency calculator.

# Key Features
- **Pure CSS Interactive Pipeline**: Toggles active detail tabs for all pipeline steps using pure CSS selectors (`:checked ~ label`), working without Javascript.
- **Automated Live Skill Snippet Synchronization**: Kept 100% synchronized with live `SKILL.md` and script files across all skills via [`scripts/sync-skills.js`](/scripts/sync-skills.js) (`npm run okf:sync` and `npm run okf:sync:check`), invoked automatically by `okf-maintain`.
- **Token Efficiency Simulator**: Calculates ongoing token consumption rates for traditional search exploration versus OKF-guided progressive disclosures on both legacy and greenfield codebases.
- **Workflow Playbooks**: Outlines setup steps and strategies for deploying OKF in different project scopes.
