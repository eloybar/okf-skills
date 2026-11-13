---
type: Skill
title: OKF Wayfinder Skill
description: Guided wizard to bootstrap and document concepts using codebase context, module clustering, and focus questions.
resource: okf-wayfinder/SKILL.md
tags: [wizard, onboarding, creation, documentation]
status: stable
generated:
  by: Antigravity/4.0
  at: 2026-11-13T23:21:18Z
verified:
  - by: human:eloybar
    at: 2026-11-13T23:21:18Z
sources:
  - okf-wayfinder/scripts/wayfinder_taxonomy.js
---

# Overview
The `okf-wayfinder` skill serves as an interactive knowledge cartographer for the OKF bundle. It runs a developer-facing questionnaire combined with automated codebase telemetry to bridge the gap between static code structures and dynamic tribal business context, producing `human-reviewed` concepts that conform to [OKF Specification v0.2](/concepts/okf-specification.md).

# Key Features
- **Registry, Graph & Taxonomy Discovery**: Runs [`wayfinder_taxonomy.js`](/okf-wayfinder/scripts/wayfinder_taxonomy.js) (`npm run okf:wayfinder` or `--bundle <path>`) to extract existing `types`, `tags`, `concepts` (with ready-to-use `markdownLink` strings and compact single-line JSON serialization unless `--full` is passed), `layoutMode` (`flat` vs `nested`), active `subdirectories`, and undocumented workspace files (`frontier`). Automatically tracks `resource`, `sources`, and `Attested Computation` dependencies (`computation`, `executor.resource`, `attester.resource`) including directory-level bindings and percent-encoded `file://` URIs, while ignoring archived concept folders, nested git repositories, hashed build bundles (`assets/<name>-<hash>.js`), binary dumps (`.bin`, `.rdb`, `.elf`, `.hex`, `.uf2`, `.map`), static media/font/office/archive assets (`.jpg`, `.png`, `.svg`, `.pdf`, `.xlsx`, `.zip`, `.pkpass`, etc.), auxiliary/steering files (`README.md`, `AGENTS.md`, `CLAUDE.md`, etc.), the active OKF bundle, nested OKF bundles (`index.md` with `okf_version`), and child sub-packages that host their own nested OKF bundle.
- **Clustered Frontier Proposals (`frontierGroups`)**: Groups undocumented workspace files by directory/module with a suggested `type`, primary `resource` candidate (`primaryCandidate`), and companion `sources` (`companionFiles`) so an entire module graduates out of `## Not yet specified` in `index.md` in a single interview.
- **Automated File Telemetry (`--inspect <file>`)**: Extracts exported symbols, local relative imports/requires, auto-resolved `relatedConcepts` cross-links (ranking `Documents imported dependency` ahead of `Shares enclosing module`, scoping generic top-level containers like `src/` or `packages/` to their 2-segment subsystem directory such as `src/services/`, and capping at 8 matches), `git log -1` timestamps (`lastModified`), and primary Git contributors (`suggestedVerifierActor`) to pre-fill draft concepts.
- **Type-Aware & Complexity-Scaled Focus Interview (1–3 Default, Max 7)**: Scales the interview dynamically based on prompt and module complexity—defaulting to 1–3 targeted questions for code-backed concepts, expanding to 4–5 questions for multi-file subsystems/ADRs/playbooks, and allowing a hard cap of up to 7 questions (batched via native structured question tools `ask_question` / `AskUserQuestion`) when bootstrapping greenfield architecture or specifying complex `Attested Computation` contracts.
- **Human-Reviewed Trust Attestation & Post-Authoring Sync**: Records developer approval in `verified: [{ by: human:<id>, at: <ISO-8601> }]` to immediately establish the `human-reviewed` trust tier, and finishes by invoking [OKF Maintain Skill](/concepts/okf-maintain-skill.md) and [OKF Lint Skill](/concepts/okf-lint-skill.md) (`--drift`) to update `index.md` and `log.md`.
- **Model-Tier Steering**: Recommends running on the **High** reasoning setting of the active model during initial bundle bootstrapping and interactive concept discovery interviews, then switching back to **Medium** for implementation and routine upkeep.
