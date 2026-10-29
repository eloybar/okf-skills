---
type: Skill
title: OKF Wayfinder Skill
description: Guided wizard to bootstrap and document concepts using codebase context and focus questions.
resource: file:///D:/projects/okf-skills/okf-wayfinder/SKILL.md
tags: [wizard, onboarding, creation, documentation]
generated:
  by: Antigravity/4.0
  at: 2026-10-29T13:38:35.471Z
sources:
  - okf-wayfinder/scripts/wayfinder_taxonomy.js
---

# Overview
The `okf-wayfinder` skill serves as an interactive knowledge cartographer for the OKF bundle. It runs a developer-facing questionnaire to bridge the gap between static code structures and dynamic tribal business context.

# Key Features
- **Codebase Telemetry**: Scrapes schemas, route files, or config files to pre-fill a draft concept.
- **Guided Interview**: Limits user fatigue by asking a maximum of three target questions (criticality, dependencies, failover owners).
- **Taxonomy & Directory Selection**: Suggests existing types/tags using [wayfinder_taxonomy.js](/okf-wayfinder/scripts/wayfinder_taxonomy.js) and guides folder placement following scaling taxonomy guidelines.
- **Model-Tier Steering**: Recommends running on the **High** reasoning setting of the active model during initial bundle bootstrapping and interactive concept discovery interviews, then switching back to **Medium** for implementation and routine upkeep.
