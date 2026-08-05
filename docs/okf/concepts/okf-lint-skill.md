---
type: Skill
title: OKF Lint Skill
description: Statically analyzes the OKF bundle to verify conformance, link integrity, and concept drift.
resource: file:///D:/projects/okf-skills/okf-lint/SKILL.md
tags: [linter, verification, quality-gate, CI-CD]
generated:
  by: human:blub0x
  at: 2026-08-05T14:14:00Z
---

# Overview
The `okf-lint` skill is a static analysis tool that guarantees documentation quality and prevents concept-code drift at the repository level.

# Verification Steps
- **Conformance**: Checks that every concept has parseable frontmatter and a valid `type`.
- **Link Integrity**: Checks that all internal markdown links (`[Label](/concepts/target.md)`) target files that exist. Strips code ticks and fenced code blocks first to ignore code examples.
- **Concept Drift (`--drift`)**: Compares the `generated.at` timestamp (falling back to legacy `timestamp`) in each concept with the Git last modified timestamp of the associated `resource` path. If the code file is newer than the documentation timestamp, it flags a warning to run `okf-maintain` to sync.
