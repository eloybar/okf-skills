---
type: Skill
title: OKF Wayfinder Skill
description: Guided wizard to bootstrap and document concepts using codebase context and focus questions.
resource: file:///D:/projects/okf-skills/okf-wayfinder/SKILL.md
tags: [wizard, onboarding, creation, documentation]
timestamp: 2026-07-30T12:00:00Z
---

# Overview
The `okf-wayfinder` skill serves as an interactive knowledge cartographer for the OKF bundle. It runs a developer-facing questionnaire to bridge the gap between static code structures and dynamic tribal business context.

# Key Features
- **Codebase Telemetry**: Scrapes schemas, route files, or config files to pre-fill a draft concept.
- **Guided Interview**: Limits user fatigue by asking a maximum of three target questions (criticality, dependencies, failover owners).
- **Taxonomy Verification**: Runs the [wayfinder_taxonomy.js](/okf-wayfinder/scripts/wayfinder_taxonomy.js) scanner to suggest existing types and tags, preventing vocabulary fragmentation.
