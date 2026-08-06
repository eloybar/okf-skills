# Change Log

Newest changes recorded chronologically.

## 2026-08-06T10:31:47Z
- Broadened steering guidelines and maintenance triggers in `okf/SKILL.md` and `okf-maintain/SKILL.md` to cover platform/sandbox constraints (e.g., WebView/CORS quirks), developer utilities, and permanent engineering guidelines/patterns.
- Updated `AGENTS.md` to incorporate these expanded maintenance rules.
- Synchronized steering guidelines and skill copy snippets inside `index.html`.
- Implemented an automated steering notice drift verification check in `okf-lint/scripts/lint.js` to flag outdated steering notices.
- Updated frontmatter generation metadata and timestamps for modified and drifted concept files.

## 2026-08-05T14:14:00Z
- Updated `okf`, `okf-wayfinder`, `okf-maintain`, and `okf-lint` skills to conform to the OKF v0.2 specification.
- Documented greenfield bootstrapping requirements, specifying `okf_version: 0.2` in the root `index.md`.
- Replaced legacy `timestamp` and `# Citations` guidelines with `generated: { by, at }` and `sources` structures.
- Updated concept documentation files under `/docs/okf/concepts/` and refreshed their generation timestamps.
- Synchronized all skill instruction copies inside `index.html` and regenerated the cytoscape graph visualization.

## 2026-08-04T11:53:00Z
- Conducted OKF maintenance (`okf-maintain`) on `interactive-simulator.md` to reflect the expansion of the playbook timeline to 9 steps.
- Aligned `README.md` with the full 9-step timeline, correcting missing descriptions for `okf-query`, `okf-lint`, and `okf-upgrade`.
- Conducted OKF maintenance (`okf-maintain`) on `knowledge-loop.md` to synchronize with `README.md` updates.

## 2026-08-04T07:41:00Z
- Parameterized subprocess command executions in `okf-lint` and `okf-upgrade` using `execFileSync` to mitigate command injection vectors.
- Extended the linter's concept drift analysis to cover file paths listed under the frontmatter `sources` array in addition to the main `resource` path.
- Refactored `okf-wayfinder`'s frontier scan to compile and check paths against gitignore patterns rather than a static exclusions array.
- Conducted OKF maintenance, updating concept timestamps in `okf-lint-skill.md`, `okf-wayfinder-skill.md`, and `okf-upgrade-skill.md`.

## 2026-08-04T00:04:40Z
- Updated `AGENTS.md` to instruct agents to fetch the live OKF specification from GitHub on session startup and verify/align the local skill implementations with any specification updates.
- Added a rule to `AGENTS.md` requiring agents to synchronize corresponding copies inside `index.html` when editing skill files or steering documents to prevent drift in the interactive simulator.

## 2026-08-03T23:43:25Z
- Updated `okf-upgrade/scripts/upgrade.js` to automatically resolve bare/non-descriptive link labels by fetching the target concept's frontmatter `title` and rewriting the link label.
- Updated `docs/okf/concepts/okf-upgrade-skill.md` timestamp.
- Expanded integration tests in `scripts/test-lifecycle.js` to assert the correct auto-resolution of bare absolute and relative link labels while skipping code blocks.

## 2026-08-03T23:18:00Z
- Executed OKF maintenance pipeline (`okf-maintain`).
- Refreshed all 10 concept file timestamps (`generated.at`) to `2026-08-03T23:18:00Z` to synchronize with codebase updates and satisfy linter drift checks.
- Documented `scripts/test-lifecycle.js` as an undocumented file in the `index.md` frontier mapping.

## 2026-08-03T23:02:00Z
- Created the `okf-upgrade` skill to automate bundle migration from OKF v0.1 to v0.2.
- Implemented `okf-upgrade/scripts/upgrade.js` which automates conversion of legacy timestamps, maps `# Citations` sections to frontmatter `sources`, and appends `okf_version` flags.
- Created concept documentation `docs/okf/concepts/okf-upgrade-skill.md` and indexed it.
- Updated installer scripts `install.ps1` and `install.sh` to package and distribute the upgrade skill.
- Successfully upgraded the repository's own knowledge bundle to OKF v0.2.

## 2026-08-03T22:58:00Z
- Upgraded the `okf-lint`, `okf-query`, `okf-visualize`, and `okf-wayfinder` scripts to support the OKF v0.2 specification.
- Implemented a list-of-objects-aware custom YAML/frontmatter parser without external dependencies.
- Added `generated.at` fallback for git-based concept drift analysis in `okf-lint`.
- Enabled provenance-aware concept lookup in `okf-query` that scans `sources[].resource` paths.
- Enhanced the interactive HTML visualizer in `okf-visualize` to style `Attested Computation` nodes, extract source edges, and display trust tiers/lifecycle metadata in the sidebar.
- Added comprehensive integration tests in `scripts/test-lifecycle.js` validating all v0.2 specification ingestion features.

## 2026-08-03T14:00:00Z
- Added Directory Organization & Scaling Guidelines to `okf` and `okf-wayfinder` skills.
- Added Scale Trigger and Link Refactoring Guidelines to `okf-maintain` skill.
- Upgraded all 6 skills to version `1.3.0` and updated `okf-lint/scripts/lint.js` version constant.
- Updated all concept files timestamps to `2026-08-03T14:00:00Z` to synchronize drift check.

## 2026-08-02T14:02:00Z
- Ran the `okf-maintain` pipeline to resolve concept drift for `interactive-simulator` and `okf-skill` concepts.

## 2026-08-02T13:42:00Z
- Updated `AGENTS.md` and the bootstrapping `okf/SKILL.md` to instruct incoming agents to ground their initial questions on startup in the OKF bundle first.
- Synchronized instruction copies in `index.html`.
- Updated all skill concept timestamps (`okf-skill`, `okf-lint-skill`, `okf-maintain-skill`, `okf-query-skill`, `okf-visualize-skill`, and `okf-wayfinder-skill`) to synchronize drift checks.

## 2026-07-30T21:30:00Z
- Added automated skills version checker on startup within `okf-lint`.
- Cached version checking queries for 24 hours under `~/.okf-skills-version-cache.json` for performance and offline capability.
- Versioned all 6 skills to `1.2.0` in their frontmatter files.

## 2026-07-30T12:00:00Z
- Enriched `okf-wayfinder` with automated frontier tracking (fog of war) to scan for undocumented codebase files.
- Extended the `okf-wayfinder` guided onboarding flow to support the `Decision` concept type.
- Updated `okf-lint` with a "Refer by Name" link text validator to prevent bare path/URL link labels.
- Updated `okf-maintain` to manage the `index.md` frontier mapping.

## 2026-07-29T22:55:00Z
- Updated `README.md` to add troubleshooting warnings explaining pathing/visibility issues with `npx skills --global` on Antigravity and Claude Code.

## 2026-07-29T22:24:00Z
- Created and packaged the `okf-lint` static analyzer and `okf-query` context retrieval skills.
- Created `okf-lint-skill.md` and `okf-query-skill.md` concept maps under `/docs/okf/concepts/`.
- Updated installer scripts (`install.ps1` and `install.sh`) to distribute the new skills.
- Registered both skills inside `index.md` and `knowledge-loop.md` to complete the 8-step lifecycle model.

## 2026-07-29T22:17:13Z
- Added `--all` flag to `npx skills` installation instructions in `README.md` to support automated, non-interactive selection of all skills.

## 2026-07-29T22:12:34Z
- Swapped Step 2 (Initial Bundle via `/okf`) and Step 3 (Guided Wizard via `/okf-wayfinder`) in `README.md` and `knowledge-loop.md` to fix the logical initialization sequence.

## 2026-07-29T21:56:58Z
- Executed OKF maintenance pipeline (`okf-maintain`).
- Refreshed concept timestamps for `knowledge-loop.md`, `interactive-simulator.md`, and `skill-installers.md` to match the latest synchronization cycle.

## 2026-07-29T21:50:43Z
- Deleted duplicate `okf_thought_process.html` to eliminate code redundancy and documentation rot.
- Updated `README.md` and `docs/okf/concepts/interactive-simulator.md` to reference `index.html` as the single source of truth.

## 2026-07-29T21:47:00Z
- Added concept files documenting the repository's interactive simulator and installer scripts.
- Updated `index.md` and `log.md` to index the new concept maps.

## 2026-07-29T21:01:19Z
- Integrated `okf-wayfinder` skill into the distribution path.
- Created `okf-wayfinder/SKILL.md` and packaged the utility `wayfinder_taxonomy.js` script.
- Updated `install.ps1` and `install.sh` scripts to distribute the new skill.
- Created `docs/okf/concepts/okf-wayfinder-skill.md` concept file.
- Updated `index.md`, `log.md`, and `knowledge-loop.md` inside the bundle.

## 2026-07-29T20:54:39Z
- Bootstrapped knowledge bundle under `docs/okf/` for the OKF Skills repository.
- Created `AGENTS.md` at root pointing to `/docs/okf` as the bundle root.
- Created concept files under `docs/okf/concepts/` to document:
  - `okf-skill.md`
  - `okf-maintain-skill.md`
  - `okf-visualize-skill.md`
  - `knowledge-loop.md`
- Created `index.md` as the bundle entrypoint.
