---
type: Skill
title: OKF Maintain Skill
description: Automatically validates OKF concept bundles and ensures code changes don't rot the documentation.
resource: okf-maintain/SKILL.md
tags: [maintenance, automation, sync]
generated:
  by: Antigravity/4.0
  at: 2026-11-04T15:12:32.351Z
sources:
  - okf-maintain/scripts/maintain.js
  - scripts/test-lifecycle.js
---

# Overview
The `okf-maintain` skill runs post-edit to verify that codebase modifications match the state of OKF concepts. It provides both an automated CLI maintenance script ([`maintain.js`](/okf-maintain/scripts/maintain.js)) for rapid mechanical upkeep and guided workflows for authoring new concepts when architecture changes.

# Architecture & CLI Automation
- **Script**: Located at [`okf-maintain/scripts/maintain.js`](/okf-maintain/scripts/maintain.js).
- **Execution Modes**:
  - `node okf-maintain/scripts/maintain.js` (or `npm run okf:maintain`): Automatically detects concept-resource drift across `resource`, `sources` (string and object entries), `computation`, `executor.resource`, and `attester.resource` (including directory bindings) via both committed Git history (`git log -1`, memoized per file path, crediting a clean concept file's own commit timestamp via `getEffectiveConceptTime` to prevent false post-commit drift when code and maintained concepts are committed together) and batched uncommitted working-tree/staged changes (`git -c core.quotepath=false status --porcelain -uall` + filesystem `mtime`), propagates drift transitively across concept-to-concept dependencies in a single pass, preserves native CRLF/LF line endings in both concepts and steering files while aligning `mtime` with `generated.at`, normalizes both string and object entries in `sources:`, refreshes `generated.at`, auto-heals outdated agent steering notices (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `GEMINI.md`) to the v1.8.2 template (including Model-Tier Routing) without user prompting, scans for unindexed frontier files (skipping `archive/`, nested git repositories, build/cache directories such as `__pycache__`, compiled bytecode/binary extensions, ancestor `.gitignore` rules up to the enclosing Git root, the active OKF bundle, and any nested bundle whose `index.md` declares `okf_version`), treats files inside a bound ancestor directory or already mentioned in `index.md` prose as covered, edits only managed `- \`path\`` bullets inside `## Not yet specified` in `index.md` while preserving prose and subsequent `## ` sections byte-for-byte (and self-healing stale bundle-internal, deleted, or excluded bullets without adding an empty heading when no frontier files exist), appends entries to `log.md`, and verifies with `okf-lint --drift` (regenerating `viz.html` only when `--viz` is explicitly passed). If no bundle exists on the current branch, `findBundlesOnOtherBranches` checks local Git branches and prints a `git checkout <branch> -- <bundlePath>` hint. Resolves `workspaceRoot` directly from `--bundle <path>` for both standalone repositories and monorepo sub-packages.
  - `node okf-maintain/scripts/maintain.js --check`: Non-destructive audit mode that exits with code 1 if committed or working-tree drift, unindexed frontier files, or outdated steering notices are found.
  - `node okf-maintain/scripts/maintain.js --json`: Outputs structured JSON for CI and subagent tooling.

# Steering Template
`buildSteeringDirectivesBlock(bundleRelPath, targetVersion, skillsBase)` renders the steering block (about 450 tokens) in this order: `## 📂 Knowledge Bundle / OKF` (where the bundle is, the closest-parent `okf/` rule, the session-start lint/maintain sync), `## ⚡ Pre-Work Grounding Gate` (1 Search, 2 Per-file context, 3 Cite, 4 Model-Tier Routing) and `## ⚡ Pre-Completion Verification Gate` (1 Semantic Concept & Source Binding Upkeep, 2 Maintain, 3 Lint), then the version tag.
- **Runnable commands**: `resolveSkillsBase(workspaceRoot)` builds the script path prefix from `maintain.js`'s own install location. The prefix is workspace-relative when the skills live in the repo (in this repo it is empty, so commands read `node okf-query/...`), `~/`-relative when they live under the home directory, and absolute otherwise. The bundle path is written workspace-relative with no leading slash (e.g. `docs/okf`).
- **Compatibility contract**: `okf-lint` and `okf-maintain --check` require the strings `Pre-Work Grounding Gate`, `Pre-Completion Verification Gate`, `Model-Tier Routing` and the `<!-- okf-steering-version: X -->` tag. `scripts/test-lifecycle.js` also asserts `Semantic Concept & Source Binding Upkeep`. Keep all of these when editing the template.
- Both helpers are exported from `maintain.js`.

# Workflow
1. **Guard check**: Verifies the bundle directory exists (in this repo, `/docs/okf`).
2. **Scan changes**: Maps modified or newly added code files, API routes, computation scripts, or database schemas to OKF concepts.
3. **Update concepts**: Updates frontmatter metadata (especially the `generated` block) and documents new facts/schemas.
4. **Scale & Refactor Links**: Detects scale transitions (from flat to nested when concept count passes 10) and refactors all relative link references accordingly.
5. **Update reserved files**: Appends to `log.md` and indexes new files/directories in `index.md`.
6. **Verify conformance**: Ensures all concept files carry a valid `type` in their YAML frontmatter.
