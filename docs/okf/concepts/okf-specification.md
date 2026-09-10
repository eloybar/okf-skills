---
type: Reference
title: Open Knowledge Format (OKF) Specification v0.2
description: Official specification defining the structure, frontmatter schemas, trust tiers, and lifecycle for Open Knowledge Format bundles.
resource: file:///D:/projects/okf-skills/docs/SPEC.md
tags: [okf, specification, standard, v0.2, schema]
status: stable
generated:
  by: Antigravity/3.5-Flash
  at: 2026-09-10T13:17:00Z
sources:
  - id: gcp-okf-spec
    resource: https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md
    title: Live OKF Specification (Google Cloud Platform)
---

# Overview

The [Open Knowledge Format (OKF)](/concepts/okf-specification.md) is an open, human- and agent-friendly specification for capturing and exchanging curated knowledge that surrounds code, data, and systems. Version 0.2 standardizes metadata conventions making agent-maintained knowledge corpora trustable, fresh, and auditable without bespoke runtimes.

# Core Principles

- **Readable**: Plain UTF-8 markdown files viewable without proprietary tooling.
- **Parseable**: Standard YAML frontmatter parseable across all agent platforms.
- **Diffable**: Trackable and reviewable in git version control.
- **Portable**: Shareable across repositories, organizations, and runtime environments.

# Key Specification Elements

## 1. Bundle Structure & Reserved Files
- **Concepts**: Every non-reserved `.md` document represents a concept and requires a non-empty `type` in frontmatter.
- **`index.md`**: Directory listing supporting progressive disclosure. The bundle-root `index.md` may declare `okf_version: "0.2"`.
- **`log.md`**: Chronological update log using `## YYYY-MM-DD` date headings.

## 2. Provenance, Trust, and Lifecycle
- **Provenance (`sources`)**: Structured list of reference materials, with credibility signals (`author`, `usage_count`, `last_modified`) and `usage_window`. Claims can cite sources using markdown footnotes (`[^id]`).
- **Trust (`generated` & `verified`)**:
  - `generated: { by, at }`: Records author identity using the actor format `<producer>/<version>`, `human:<id>`, or `process:<id>`, alongside an ISO 8601 UTC timestamp.
  - `verified: [{ by, at }]`: Records independent confirmation events, inferring trust tiers: `unverified`, `machine-confirmed`, or `human-reviewed`.
- **Lifecycle (`status` & `stale_after`)**:
  - `status`: `draft`, `stable` (default), or `deprecated`.
  - `stale_after`: Absolute ISO 8601 UTC instant marking content expiration.

## 3. Attested Computations
Concepts of `type: Attested Computation` bind a sanctioned calculation contract:
- `runtime`: Execution environment (e.g. `bigquery`, `postgres`, `python`, `dbt`).
- `parameters`: Typed parameter specifications for deterministic substitution.
- `computation`: Inline block under `# Computation` or an external file path.
- `executor` & `attester`: References to run instructions/receipts and deterministic verification code.

# Repository Implementation

In this repository, the specification is implemented and supported across the skill suite:
- [OKF Core Skill](/concepts/okf-skill.md) — Authoring concepts according to the format.
- [OKF Lint Skill](/concepts/okf-lint-skill.md) — Conformance validation, link integrity, and drift analysis.
- [OKF Query Skill](/concepts/okf-query-skill.md) — Provenance search and context injection.
- [OKF Upgrade Skill](/concepts/okf-upgrade-skill.md) — Automated migration from v0.1 to v0.2.
- [OKF Visualize Skill](/concepts/okf-visualize-skill.md) — Interactive Cytoscape graph rendering.
- [The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md) — Closed-loop lifecycle binding the skills.
