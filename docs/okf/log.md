# Change Log

Newest changes recorded chronologically.



## 2026-10-24
- Synchronized timestamp for 10 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md.
- Synchronized timestamp for 1 drifted concept(s): concepts/interactive-simulator.md.
- Synchronized workspace frontier mapping in `index.md` (0 undocumented files mapped).
- Implemented OKF Skills v1.7.0 Pre-Completion Drift & Upkeep improvements across `okf-maintain`, `okf-lint`, `okf-query`, `okf-wayfinder`, `okf-visualize`, `okf-prune`, and `okf-upgrade`.
- Updated `getGitLastModifiedISO` in `maintain.js` and `lint.js` to check `git status --porcelain` and filesystem `mtime` so uncommitted working-tree and staged modifications trigger pre-commit drift detection.
- Added normalization for both shorthand string lists (`sources: ["path/to/file"]`) and structured object lists (`sources: [{ type, resource }]`) across `maintain.js`, `lint.js`, `query.js`, `wayfinder_taxonomy.js`, and `visualize.js`, and hardened `parseFrontmatter` across all 7 skill scripts for unquoted URI list items.
- Added `[Drift Warning]` in `okf-lint/scripts/lint.js` (`--drift`) when modified or newly created workspace code files (`FRONTIER_EXTENSIONS`) are not bound to any concept's `resource` or `sources` frontmatter.
- Updated `maintain.js` to resolve sibling `okf-visualize` (`--no-open`) and `okf-lint` (`--drift`) scripts relative to `__dirname` before falling back to `workspaceRoot`.
- Bumped `TARGET_STEERING_VERSION`, `INSTALLED_VERSION`, and `package.json` to `1.7.0`, adding Step 1 (**Semantic Concept & Source Binding Upkeep**) to the `## ⚡ Pre-Completion Verification Gate (MANDATORY)` block in `AGENTS.md`, `okf/SKILL.md`, `okf-maintain/SKILL.md`, and `index.html`.
- Bound all skill implementation scripts and test suites in the `sources` frontmatter of their respective concepts under `/docs/okf/concepts/`, graduating all 16 codebase files out of `## Not yet specified` in `docs/okf/index.md`.

## 2026-10-21
- Synchronized timestamp for 4 drifted concept(s): concepts/git-development-workflow.md, concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-course.md.
- Synchronized workspace frontier mapping in `index.md` (16 undocumented files mapped).

## 2026-10-10
- Synchronized timestamp for 2 drifted concept(s): concepts/git-development-workflow.md, concepts/knowledge-loop.md.
- Synchronized workspace frontier mapping in `index.md` (15 undocumented files mapped).
- Hardened frontmatter parsing across all 7 OKF skill scripts (`lint.js`, `maintain.js`, `query.js`, `prune.js`, `upgrade.js`, `visualize.js`, `wayfinder_taxonomy.js`) with `splitRespectingQuotes` to preserve commas and colons in quoted strings.
- Added comprehensive unit test suite `scripts/test-parser.js` testing 12 frontmatter parsing edge cases across all skill scripts.
- Resolved version constant drift in `okf-lint/scripts/lint.js` by bumping `INSTALLED_VERSION` to `1.6.0` and fetching version from `package.json`.
- Updated `README.md` to integrate Step 10: Lifecycle Pruning (`/okf-prune`) into the Knowledge Loop diagram, component list, and CLI package commands.
- Synchronized `docs/okf/concepts/knowledge-loop.md` and `docs/okf/concepts/skill-installers.md` to reflect all 10 pipeline steps and 8 installed skills.
- Synchronized mirror skill directories (`.agents/skills`, `.claude/skills`, `agent/skills`).
- Updated `package.json` scripts with `test:unit` and `test:lifecycle`, and updated GitHub Actions CI workflow to run `npm test`.

## 2026-09-22
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-prune-skill.md, concepts/skill-installers.md.
- Synchronized workspace frontier mapping in `index.md` (14 undocumented files mapped).
- Synchronized timestamp for 5 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md.
- Added mandatory Pre-Work Grounding Gate to `AGENTS.md` and upgraded steering version tracking to v1.6.0.
- Enhanced `okf-query` with Tier 2 directory and subsystem matching, enabling queries on files within documented modules to resolve matching concepts with actionable search fallback guidance.
- Updated `okf-lint` and `okf-maintain` to audit and auto-heal steering notices across all supported agents (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.) to v1.6.0 with both Pre-Work Grounding and Pre-Completion Verification Gates.
- Upgraded skill definitions (`okf/SKILL.md`, `okf-maintain/SKILL.md`, `okf-lint/SKILL.md`, `okf-query/SKILL.md`) to reflect new steering specifications and query capabilities.
- Synchronized steering guidelines, code blocks, and interactive simulator snippets in `index.html`.
- Updated OKF concept files (`okf-lint-skill.md`, `okf-maintain-skill.md`, `okf-query-skill.md`, `okf-skill.md`, `knowledge-loop.md`) and refreshed generation metadata.
- Rebuilt interactive graph visualization (`viz.html`).

## 2026-09-19
- Synchronized timestamp for 2 drifted concept(s): concepts/git-development-workflow.md, concepts/knowledge-loop.md.
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-maintain-skill.md, concepts/okf-skill.md.
- Synchronized timestamp for 2 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-maintain-skill.md.
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-maintain-skill.md, concepts/okf-skill.md.
- Implemented `okf-maintain/scripts/maintain.js` CLI utility providing rapid automated synchronization of concept drift timestamps, frontier tracking in `index.md`, logging in `log.md`, and visualizer re-rendering.
- Upgraded `okf-lint/scripts/lint.js` with `--json` structured metrics output and `stale_after` freshness validation conforming to OKF v0.2 §5.4.
- Added root `package.json` manifest with standard npm script aliases (`npm test`, `npm run okf:lint:drift`, `npm run okf:maintain`, etc.) with zero runtime or dev dependencies.
- Added Mandatory Pre-Completion Verification Gate to `AGENTS.md` and upgraded steering version comment to `1.5.0`.
- Upgraded `okf`, `okf-maintain`, and `okf-lint` skills to version `1.5.0` and synchronized corresponding snippets inside `index.html`.
- Updated integration lifecycle test suite (`scripts/test-lifecycle.js`) with comprehensive assertions for `maintain.js`, `lint.js --json`, and `stale_after` validation.
- Validated bundle conformance with `okf-lint --drift` (0 errors, 0 warnings) and passed full integration test suite (`scripts/test-lifecycle.js`).

## 2026-09-11
- Set executable git file mode (`100755`) on `install.sh` to prevent `Permission denied` errors when running `./install.sh` on Linux/macOS.
- Updated `README.md` and `okf-lint` installer instructions to invoke `bash ./install.sh` for reliable execution across Unix environments.

## 2026-09-10
- Incorporated `docs/SPEC.md` into the OKF bundle by creating the [OKF Specification v0.2](/concepts/okf-specification.md) concept document.
- Updated [OKF Core Skill](/concepts/okf-skill.md) and [The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md) to cross-link to the new specification concept.
- Synchronized concept timestamps for `knowledge-loop.md` to resolve concept drift against `README.md`.
- Normalized bundle concept actors to `<producer>/<version>` and `log.md` date headings to `YYYY-MM-DD`.
- Incorporated the comprehensive [Git Development and Pull Request Workflow](/concepts/git-development-workflow.md) playbook from Chronotrader into the bundle, superseding the previous development-workflow stub with detailed guidelines on branch naming, PR sizing, commit grouping, verification gates, rebase-merges, and AI coding agent mandates.

## 2026-08-24
- Fixed installation instructions in `README.md` for Method 2 (PowerShell and Bash) to check for a valid `.git` directory before pulling, and to automatically remove any non-git/broken folders before cloning to prevent "not a git repository" and "already exists" errors.
- Synchronized concept timestamps for `development-workflow.md` and `knowledge-loop.md`.

- Updated `README.md` installation instructions to make the PowerShell and Bash local script installer commands (Method 2) idempotent, preventing failures when the target clone directory already exists.
- Added a Direct Web Installer section (Method 3) to `README.md` enabling quick installation via PowerShell or curl without local cloning.
- Updated concept timestamps for `development-workflow.md` and `knowledge-loop.md` to align with the changes.

- Updated the `okf-wayfinder` skill (`okf-wayfinder/SKILL.md`) to explicitly instruct agents to create/update steering configuration files (`AGENTS.md`, `CLAUDE.md`, or `.cursorrules`) when initializing a new OKF bundle.
- Synchronized the corresponding wayfinder skill copy snippet in `index.html` to prevent documentation drift in the interactive playbook/simulator.
- Updated the metadata timestamp in the `okf-wayfinder-skill` concept map (`docs/okf/concepts/okf-wayfinder-skill.md`).
- Created the `development-workflow` playbook concept (`docs/okf/concepts/development-workflow.md`) documenting the standard git contribution, PR creation, rebase-merge, and remote branch cleanup workflow.

## 2026-08-06
- Updated the Windows installation instructions in `README.md` to use a conditional `if ($?)` execution block, preventing failure when the clone target directory already exists.
- Updated `docs/okf/concepts/knowledge-loop.md` timestamp to reflect README modifications.

- Broadened steering guidelines and maintenance triggers in `okf/SKILL.md` and `okf-maintain/SKILL.md` to cover platform/sandbox constraints (e.g., WebView/CORS quirks), developer utilities, and permanent engineering guidelines/patterns.
- Updated `AGENTS.md` to incorporate these expanded maintenance rules.
- Synchronized steering guidelines and skill copy snippets inside `index.html`.
- Implemented an automated steering notice drift verification check in `okf-lint/scripts/lint.js` to flag outdated steering notices.
- Updated frontmatter generation metadata and timestamps for modified and drifted concept files.

## 2026-08-05
- Updated `okf`, `okf-wayfinder`, `okf-maintain`, and `okf-lint` skills to conform to the OKF v0.2 specification.
- Documented greenfield bootstrapping requirements, specifying `okf_version: 0.2` in the root `index.md`.
- Replaced legacy `timestamp` and `# Citations` guidelines with `generated: { by, at }` and `sources` structures.
- Updated concept documentation files under `/docs/okf/concepts/` and refreshed their generation timestamps.
- Synchronized all skill instruction copies inside `index.html` and regenerated the cytoscape graph visualization.

## 2026-08-04
- Conducted OKF maintenance (`okf-maintain`) on `interactive-simulator.md` to reflect the expansion of the playbook timeline to 9 steps.
- Aligned `README.md` with the full 9-step timeline, correcting missing descriptions for `okf-query`, `okf-lint`, and `okf-upgrade`.
- Conducted OKF maintenance (`okf-maintain`) on `knowledge-loop.md` to synchronize with `README.md` updates.

- Parameterized subprocess command executions in `okf-lint` and `okf-upgrade` using `execFileSync` to mitigate command injection vectors.
- Extended the linter's concept drift analysis to cover file paths listed under the frontmatter `sources` array in addition to the main `resource` path.
- Refactored `okf-wayfinder`'s frontier scan to compile and check paths against gitignore patterns rather than a static exclusions array.
- Conducted OKF maintenance, updating concept timestamps in `okf-lint-skill.md`, `okf-wayfinder-skill.md`, and `okf-upgrade-skill.md`.

- Updated `AGENTS.md` to instruct agents to fetch the live OKF specification from GitHub on session startup and verify/align the local skill implementations with any specification updates.
- Added a rule to `AGENTS.md` requiring agents to synchronize corresponding copies inside `index.html` when editing skill files or steering documents to prevent drift in the interactive simulator.

## 2026-08-03
- Updated `okf-upgrade/scripts/upgrade.js` to automatically resolve bare/non-descriptive link labels by fetching the target concept's frontmatter `title` and rewriting the link label.
- Updated `docs/okf/concepts/okf-upgrade-skill.md` timestamp.
- Expanded integration tests in `scripts/test-lifecycle.js` to assert the correct auto-resolution of bare absolute and relative link labels while skipping code blocks.

- Executed OKF maintenance pipeline (`okf-maintain`).
- Refreshed all 10 concept file timestamps (`generated.at`) to `2026-08-03T23:18:00Z` to synchronize with codebase updates and satisfy linter drift checks.
- Documented `scripts/test-lifecycle.js` as an undocumented file in the `index.md` frontier mapping.

- Created the `okf-upgrade` skill to automate bundle migration from OKF v0.1 to v0.2.
- Implemented `okf-upgrade/scripts/upgrade.js` which automates conversion of legacy timestamps, maps `# Citations` sections to frontmatter `sources`, and appends `okf_version` flags.
- Created concept documentation `docs/okf/concepts/okf-upgrade-skill.md` and indexed it.
- Updated installer scripts `install.ps1` and `install.sh` to package and distribute the upgrade skill.
- Successfully upgraded the repository's own knowledge bundle to OKF v0.2.

- Upgraded the `okf-lint`, `okf-query`, `okf-visualize`, and `okf-wayfinder` scripts to support the OKF v0.2 specification.
- Implemented a list-of-objects-aware custom YAML/frontmatter parser without external dependencies.
- Added `generated.at` fallback for git-based concept drift analysis in `okf-lint`.
- Enabled provenance-aware concept lookup in `okf-query` that scans `sources[].resource` paths.
- Enhanced the interactive HTML visualizer in `okf-visualize` to style `Attested Computation` nodes, extract source edges, and display trust tiers/lifecycle metadata in the sidebar.
- Added comprehensive integration tests in `scripts/test-lifecycle.js` validating all v0.2 specification ingestion features.

- Added Directory Organization & Scaling Guidelines to `okf` and `okf-wayfinder` skills.
- Added Scale Trigger and Link Refactoring Guidelines to `okf-maintain` skill.
- Upgraded all 6 skills to version `1.3.0` and updated `okf-lint/scripts/lint.js` version constant.
- Updated all concept files timestamps to `2026-08-03T14:00:00Z` to synchronize drift check.

## 2026-08-02
- Ran the `okf-maintain` pipeline to resolve concept drift for `interactive-simulator` and `okf-skill` concepts.

- Updated `AGENTS.md` and the bootstrapping `okf/SKILL.md` to instruct incoming agents to ground their initial questions on startup in the OKF bundle first.
- Synchronized instruction copies in `index.html`.
- Updated all skill concept timestamps (`okf-skill`, `okf-lint-skill`, `okf-maintain-skill`, `okf-query-skill`, `okf-visualize-skill`, and `okf-wayfinder-skill`) to synchronize drift checks.

## 2026-07-30
- Added automated skills version checker on startup within `okf-lint`.
- Cached version checking queries for 24 hours under `~/.okf-skills-version-cache.json` for performance and offline capability.
- Versioned all 6 skills to `1.2.0` in their frontmatter files.

- Enriched `okf-wayfinder` with automated frontier tracking (fog of war) to scan for undocumented codebase files.
- Extended the `okf-wayfinder` guided onboarding flow to support the `Decision` concept type.
- Updated `okf-lint` with a "Refer by Name" link text validator to prevent bare path/URL link labels.
- Updated `okf-maintain` to manage the `index.md` frontier mapping.

## 2026-07-29
- Updated `README.md` to add troubleshooting warnings explaining pathing/visibility issues with `npx skills --global` on Antigravity and Claude Code.

- Created and packaged the `okf-lint` static analyzer and `okf-query` context retrieval skills.
- Created `okf-lint-skill.md` and `okf-query-skill.md` concept maps under `/docs/okf/concepts/`.
- Updated installer scripts (`install.ps1` and `install.sh`) to distribute the new skills.
- Registered both skills inside `index.md` and `knowledge-loop.md` to complete the 8-step lifecycle model.

- Added `--all` flag to `npx skills` installation instructions in `README.md` to support automated, non-interactive selection of all skills.

- Swapped Step 2 (Initial Bundle via `/okf`) and Step 3 (Guided Wizard via `/okf-wayfinder`) in `README.md` and `knowledge-loop.md` to fix the logical initialization sequence.

- Executed OKF maintenance pipeline (`okf-maintain`).
- Refreshed concept timestamps for `knowledge-loop.md`, `interactive-simulator.md`, and `skill-installers.md` to match the latest synchronization cycle.

- Deleted duplicate `okf_thought_process.html` to eliminate code redundancy and documentation rot.
- Updated `README.md` and `docs/okf/concepts/interactive-simulator.md` to reference `index.html` as the single source of truth.

- Added concept files documenting the repository's interactive simulator and installer scripts.
- Updated `index.md` and `log.md` to index the new concept maps.

- Integrated `okf-wayfinder` skill into the distribution path.
- Created `okf-wayfinder/SKILL.md` and packaged the utility `wayfinder_taxonomy.js` script.
- Updated `install.ps1` and `install.sh` scripts to distribute the new skill.
- Created `docs/okf/concepts/okf-wayfinder-skill.md` concept file.
- Updated `index.md`, `log.md`, and `knowledge-loop.md` inside the bundle.

- Bootstrapped knowledge bundle under `docs/okf/` for the OKF Skills repository.
- Created `AGENTS.md` at root pointing to `/docs/okf` as the bundle root.
- Created concept files under `docs/okf/concepts/` to document:
  - `okf-skill.md`
  - `okf-maintain-skill.md`
  - `okf-visualize-skill.md`
  - `knowledge-loop.md`
- Created `index.md` as the bundle entrypoint.
