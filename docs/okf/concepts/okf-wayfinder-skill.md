---
type: Skill
title: OKF Wayfinder Skill
description: Guided wizard to bootstrap and document concepts using codebase context, module clustering, and focus questions.
resource: file:///D:/projects/okf-skills/okf-wayfinder/SKILL.md
tags: [wizard, onboarding, creation, documentation]
status: stable
generated:
  by: Antigravity/4.0
  at: 2026-11-04T19:06:51.051Z
verified:
  - by: human:luciano-barrios
    at: 2026-11-01T23:59:00Z
sources:
  - okf-wayfinder/scripts/wayfinder_taxonomy.js
---

# Overview
The `okf-wayfinder` skill serves as an interactive knowledge cartographer for the OKF bundle. It runs a developer-facing questionnaire combined with automated codebase telemetry to bridge the gap between static code structures and dynamic tribal business context, producing `human-reviewed` concepts that conform to [OKF Specification v0.2](/concepts/okf-specification.md).

# Key Features
- **Registry, Graph & Taxonomy Discovery**: Runs [`wayfinder_taxonomy.js`](/okf-wayfinder/scripts/wayfinder_taxonomy.js) (`npm run okf:wayfinder` or `--bundle <path>`) to extract existing `types`, `tags`, `concepts` (with ready-to-use `markdownLink` strings), `layoutMode` (`flat` vs `nested`), active `subdirectories`, and undocumented workspace files (`frontier`). Automatically tracks `resource`, `sources`, and `Attested Computation` dependencies (`computation`, `executor.resource`, `attester.resource`) including directory-level bindings and percent-encoded `file://` URIs, while ignoring archived concept folders, nested git repositories, static media/font/office/archive assets (`.jpg`, `.png`, `.svg`, `.pdf`, `.xlsx`, `.zip`, `.pkpass`, etc.), auxiliary/steering files (`README.md`, `AGENTS.md`, `CLAUDE.md`, etc.), the active OKF bundle, nested OKF bundles (`index.md` with `okf_version`), and child sub-packages that host their own nested OKF bundle.
- **Clustered Frontier Proposals (`frontierGroups`)**: Groups undocumented workspace files by directory/module with a suggested `type`, primary `resource` candidate (`primaryCandidate`), and companion `sources` (`companionFiles`) so an entire module graduates out of `## Not yet specified` in `index.md` in a single interview.
- **Automated File Telemetry (`--inspect <file>`)**: Extracts exported symbols, local relative imports/requires, auto-resolved `relatedConcepts` cross-links, `git log -1` timestamps (`lastModified`), and primary Git contributors (`suggestedVerifierActor`) to pre-fill draft concepts.
- **Type-Aware Focus Interview**: Limits user fatigue to at most three targeted questions tailored to the concept type (`Concept`, `Skill`, `Utility`, `Playbook`, `Decision`, or `Attested Computation`), utilizing native structured question tools (`ask_question` / `AskUserQuestion`) when available.
- **Human-Reviewed Trust Attestation & Post-Authoring Sync**: Records developer approval in `verified: [{ by: human:<id>, at: <ISO-8601> }]` to immediately establish the `human-reviewed` trust tier, and finishes by invoking [OKF Maintain Skill](/concepts/okf-maintain-skill.md) and [OKF Lint Skill](/concepts/okf-lint-skill.md) (`--drift`) to update `index.md` and `log.md`.
- **Model-Tier Steering**: Recommends running on the **High** reasoning setting of the active model during initial bundle bootstrapping and interactive concept discovery interviews, then switching back to **Medium** for implementation and routine upkeep.
