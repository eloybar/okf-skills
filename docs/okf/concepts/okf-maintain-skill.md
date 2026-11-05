---
type: Skill
title: OKF Maintain Skill
description: Automatically validates OKF concept bundles and ensures code changes don't rot the documentation.
resource: okf-maintain/SKILL.md
tags: [maintenance, automation, sync]
generated:
  by: Antigravity/4.0
  at: 2026-11-05T01:58:58.107Z
sources:
  - okf-maintain/scripts/maintain.js
  - scripts/test-lifecycle.js
---

# Overview
The `okf-maintain` skill runs post-edit to verify that codebase modifications match the state of OKF concepts. It provides both an automated CLI maintenance script ([`maintain.js`](/okf-maintain/scripts/maintain.js)) for rapid mechanical upkeep and guided workflows for authoring new concepts when architecture changes.

# Architecture & CLI Automation
- **Script**: Located at [`okf-maintain/scripts/maintain.js`](/okf-maintain/scripts/maintain.js).
- **Execution Modes**:
  - `node okf-maintain/scripts/maintain.js` (or `npm run okf:maintain`): Automatically detects concept-resource drift across `resource`, `sources` (string and object entries), `computation`, `executor.resource`, and `attester.resource` (including directory bindings, while decoding percent-encoded `file://` URIs, stripping `#fragment`/`?query` suffixes, ignoring non-path schemes like `git:323eae6:...`, and exempting reserved bundle files `log.md`/`index.md`/`viz.html` from triggering drift) via both batched repository-wide committed Git history (`getRepoCommitTimeMap` using a single `git log -m --format=__OKF_COMMIT__%aI --name-only` pass per repo, crediting a clean concept file's own commit timestamp via `getEffectiveConceptTime` to prevent false post-commit drift when code and maintained concepts are committed together) and batched uncommitted working-tree/staged changes (`git -c core.quotepath=false status --porcelain -uall` + filesystem `mtime`), propagates drift transitively across concept-to-concept dependencies in a single pass, preserves native CRLF/LF line endings in both concepts and steering files while aligning `mtime` with `generated.at`, normalizes both string and object entries in `sources:`, refreshes `generated.at`, auto-heals outdated agent steering notices (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `GEMINI.md`) to the v1.8.2 template (including Model-Tier Routing and auto-healing `node ~/` commands on Windows) without user prompting, detects and auto-indexes unindexed active concepts into `index.md` (`findUnindexedConcepts` / `updateIndexConcepts`), scans for unindexed frontier files (skipping `archive/`, nested git repositories, build/cache directories such as `__pycache__`, compiled bytecode/binary extensions, static media/font/office/archive assets such as `.jpg`/`.png`/`.svg`/`.pdf`/`.xlsx`/`.zip`/`.pkpass`, auxiliary/steering files such as `README.md`/`AGENTS.md`/`CLAUDE.md`, ancestor `.gitignore` rules up to the enclosing Git root, the active OKF bundle, any nested bundle whose `index.md` declares `okf_version`, and any child sub-package directory that hosts its own nested OKF bundle), treats files inside a bound ancestor directory or already mentioned anywhere in the bundle (`index.md`, `log.md`, or concept markdown bodies, including backtick-quoted filenames and ellipsis-abbreviated `` `…<suffix>` `` references) as covered, edits only single-line auto-generated `- \`path\` — Undocumented codebase file.` bullets inside `## Not yet specified` in `index.md` while preserving hand-written single-line and multi-line notes, prose, and subsequent `## ` sections byte-for-byte, appends entries to `log.md` (inserting new `## YYYY-MM-DD` headings before either existing `## YYYY-MM-DD` headings or bullet-dated `- YYYY-MM-DD` entries), and verifies with `okf-lint --drift` (regenerating `viz.html` only when `--viz` is explicitly passed). If no bundle exists on the current branch, `findBundlesOnOtherBranches` checks local Git branches and prints a `git checkout <branch> -- <bundlePath>` hint. Resolves `workspaceRoot` directly from `--bundle <path>` for both standalone repositories and monorepo sub-packages.
  - `node okf-maintain/scripts/maintain.js --check`: Non-destructive audit mode that exits with code 1 if committed or working-tree drift, unindexed active concepts (`unindexedConcepts`), unindexed frontier files (`unindexedFrontier`), or outdated steering notices (`outdatedSteering`) are found.
  - `node okf-maintain/scripts/maintain.js --json`: Outputs structured JSON for CI and subagent tooling.
  - `node okf-maintain/scripts/maintain.js --evaluate [conversation-id | --latest] [--brain-dir <path>] [--json] [--reset]`: Evaluates agent session transcripts (`transcript.jsonl`) and passive CLI telemetry (`~/.okf/telemetry.jsonl`, overridable via `OKF_TELEMETRY_PATH` / `--telemetry` and disableable via `OKF_DISABLE_TELEMETRY=1`) to score OKF Steering Gate compliance, surface query misses, >40KB context bloat truncations, backgrounded slow commands, and `edit_file` errors, and emit prioritized self-improvement recommendations (or reset telemetry when `--reset` is passed). Normal sync mode also emits a 1-line `[OKF Self-Improvement]` nudge when anomalies occurred since the last sync.

# Steering Template
`buildSteeringDirectivesBlock(bundleRelPath, targetVersion, skillsBase)` renders the steering block (about 450 tokens) in this order: `## 📂 Knowledge Bundle / OKF` (where the bundle is, the closest-parent `okf/` rule, the session-start lint/maintain sync), `## ⚡ Pre-Work Grounding Gate` (1 Search, 2 Per-file context, 3 Cite, 4 Model-Tier Routing) and `## ⚡ Pre-Completion Verification Gate` (1 Semantic Concept & Source Binding Upkeep, 2 Maintain, 3 Lint), then the version tag.
- **Runnable commands**: `resolveSkillsBase(workspaceRoot, options)` builds the script path prefix from `maintain.js`'s own install location. The prefix is workspace-relative when the skills live in the repo (in this repo it is empty, so commands read `node okf-query/...`), `~/`-relative on POSIX when they live under the home directory, and forward-slash absolute on Windows (`win32`, since PowerShell/cmd do not expand `~/` when passed as an argument to `node`). The bundle path is written workspace-relative with no leading slash (e.g. `docs/okf`).
- **Compatibility contract**: `okf-lint` and `okf-maintain --check` require the strings `Pre-Work Grounding Gate`, `Pre-Completion Verification Gate`, `Model-Tier Routing` and the `<!-- okf-steering-version: X -->` tag. `scripts/test-lifecycle.js` also asserts `Semantic Concept & Source Binding Upkeep`. Keep all of these when editing the template.
- Both helpers are exported from `maintain.js`.

# Workflow
1. **Guard check**: Verifies the bundle directory exists (in this repo, `/docs/okf`).
2. **Scan changes**: Maps modified or newly added code files, API routes, computation scripts, or database schemas to OKF concepts.
3. **Update concepts**: Updates frontmatter metadata (especially the `generated` block) and documents new facts/schemas.
4. **Scale & Refactor Links**: Detects scale transitions (from flat to nested when concept count passes 10) and refactors all relative link references accordingly.
5. **Update reserved files**: Appends to `log.md` and indexes new files/directories in `index.md`.
6. **Verify conformance**: Ensures all concept files carry a valid `type` in their YAML frontmatter.
