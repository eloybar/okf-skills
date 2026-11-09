# Change Log

Newest changes recorded chronologically.


## 2026-11-08
- Applied `/okf-learn --latest` audit improvements across `okf-query/scripts/query.js` (displaying `Sources:` in concept metadata headers, printing a `Note: Queried path(s) not found on disk:` warning when a non-existent `--file` path resolves via fallback/directory, and adding Tier 1C `.md` concept path suffix/basename fallback), `okf-learn/scripts/learn.js` (measuring `measureOkfContextBlockBytes` per individual `OKF CONTEXT BLOCK` when multiple `query.js` calls are chained in one shell command), `okf-maintain/scripts/maintain.js` and `AGENTS.md` (guiding agents to batch multiple paths in a single `--file <path[,path2,...]>` call), and `scripts/test-lifecycle.js` (Step 19l).

## 2026-11-07
- Added `--help` / `-h` usage and options switches across all OKF CLI scripts (`maintain.js`, `prune.js`, `upgrade.js`, `query.js`, `lint.js`, `learn.js`, `visualize.js`, `wayfinder_taxonomy.js`), documented `--help` invocation in all 7 `SKILL.md` files, and added automated `--help` verification in `scripts/test-parser.js`.
- Applied `/okf-learn --latest` audit improvements across `okf-query/scripts/query.js` (reducing `MAX_TOTAL_BODY_CHARS` to `20000` and compacting omitted match headers to 3-line summaries), `okf-wayfinder/scripts/wayfinder_taxonomy.js` (scoping `--inspect` `relatedConcepts` on generic containers like `src/` to 2-segment subsystems such as `src/services/`, ranking imported dependencies first, capping `relatedConcepts` at 8, syncing hashed asset/binary frontier exclusions, and compacting default JSON serialization), `okf-learn/scripts/learn.js` (`measureOkfContextBlockBytes` for chained shell commands), and `scripts/test-lifecycle.js` (Step 19k).
- Updated Step 4 of `okf-wayfinder/SKILL.md` and `docs/okf/concepts/okf-wayfinder-skill.md` to support complexity-scaled focus interviews (1–3 questions by default for code-backed modules, 4–5 for multi-file subsystems/ADRs/playbooks, and a hard cap of 7 questions when needed for greenfield or `Attested Computation` specifications).
- Updated Step 4 of `okf-learn/SKILL.md` and `docs/okf/concepts/okf-learn-skill.md` so `node okf-learn/scripts/learn.js --reset` is executed unconditionally at the end of every `/okf-learn` run (whether in a project workspace, inside `okf-skills`, or when zero issues are found).
- Added `--verify` and `--stale-after` (`--all-stale`, `--all`, `--by`, `--clear-stale`, `updateConceptVerification`, `verifyConcepts`) to `okf-maintain/scripts/maintain.js` and `okf-maintain/SKILL.md`, and consolidated `okf-prune` and `okf-upgrade` into `okf-maintain` (`--prune` via `okf-maintain/scripts/prune.js` and `--upgrade` / `--skills` via `okf-maintain/scripts/upgrade.js`, reducing the top-level skill suite from 9 to 7 skills and auto-removing legacy `okf-prune` / `okf-upgrade` folders during skill sync).
- Added `resetAt` session history watermark (`~/.okf/learn-state.json` via `resolveLearnStatePath` and `readResetTimestampMs`) to `okf-learn/scripts/learn.js` and updated `okf-learn/SKILL.md` so `okf-learn --reset` excludes pre-reset transcripts from `--latest`/`--recent`, slices continued project sessions to only steps recorded after `resetAt`, and defaults `/okf-learn` to auditing `--latest` rather than 5 historical sessions.
- Applied `/okf-learn` retrospective improvements across `okf-query/scripts/query.js` (capping multi-concept `--search ... --full` output at `MAX_FULL_SEARCH_BODY_CHARS = 32000` to prevent >40KB `context_bloat` truncations and updating progressive-disclosure hints to suggest `--file <concept> --full`), `okf-learn/scripts/learn.js` (excluding network-bound `git push` / `gh pr` commands and branch names from `slowCommands`, filtering first-person non-corrective `"I don't have it"` statements in `isUserCorrectionTurn`, and satisfying `preCompletionMaintain` for read-only Q&A sessions with zero file edits), and `scripts/test-lifecycle.js` (Step 19h).
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 5 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 11 drifted concept(s): concepts/git-development-workflow.md, concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-course.md, concepts/okf-learn-skill.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-upgrade-skill.md, concepts/skill-catalog-sync.md, concepts/skill-installers.md.
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-learn-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-wayfinder-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 7 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md, concepts/okf-wayfinder-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 12 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md, concepts/skill-catalog-sync.md.

## 2026-11-06
- Updated `README.md` Method 2 local script installer commands and `tryGitFastForward` in `okf-upgrade/scripts/upgrade.js` to use `git fetch origin main` + `git reset --hard origin/main` so existing clean `okf-skills` clones update seamlessly even after `origin/main` history rewrites or force-pushes without `fatal: refusing to merge unrelated histories`.
- Added automated public-repo sanitization gate (`verifyPublicRepoSanitization` and `discoverDynamicLocalTokens`) to `scripts/sync-skills.js` and `scripts/test-parser.js`—blocking local workspace names, OS usernames, machine-specific `file:///<Drive>:/` URIs, `192.168.x.x` LAN IPs, non-synthetic UUIDs, and non-noreply git author emails—and documented the fixture anonymization mandate in `okf-learn/SKILL.md`, `docs/okf/concepts/skill-catalog-sync.md`, `docs/okf/concepts/okf-learn-skill.md`, and `docs/okf/concepts/git-development-workflow.md`.
- Replaced project-specific fixture strings in `scripts/test-lifecycle.js`, `docs/okf/concepts/okf-lint-skill.md`, `docs/okf/concepts/git-development-workflow.md`, and `docs/okf/log.md` with generic test fixtures (`GatewayAuditor`, `GatewayService`, `GatewayComms.cs`, `Acme Cloud Integrations`, `jdoe`, `.claude-enterprise`).
- Applied `/okf-learn` multi-session retrospective improvements across `okf-learn/scripts/learn.js` (skipping single-turn `/okf-learn` meta-sessions in `--latest`/`--recent` via `isMetaLearnTranscript`, filtering Claude Code context-compaction continuation summaries and attribute-bearing closing tags `</pasted_content id="...">` in `sanitizeUserTurnText`, recognizing flat `okf/<slug>.md` concept citations and pre-work reads, distinguishing `mode: 'file'` vs. `mode: 'search'` query misses to emit `search-coverage` vs. `--bind` `concept-coverage` recommendations, and excluding test-runner commands from `slowCommands`), `okf-query/scripts/query.js` (reporting `No matching OKF concepts found for search: <query>`), `okf-maintain/scripts/maintain.js` (chronological `Newest entries at the bottom` / ascending `## YYYY-MM-DD` ordering and blank-line preservation in `appendLogEntry`), and `scripts/test-lifecycle.js` (Step 19g).
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 1 drifted concept(s): concepts/okf-lint-skill.md.
- Synchronized timestamp for 2 drifted concept(s): concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md.
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/skill-catalog-sync.md.
- Applied remote `/okf-learn` handoff findings (`F1`–`F7` from Claude Code session `00000000-0000-4000-8000-000000000001`): added multi-runtime transcript discovery (`~/.claude/projects/<slug>/<session-id>.jsonl`, `~/.claude-*/projects/`, `$CLAUDE_CONFIG_DIR/projects/`, and Antigravity `brain/`) and Claude Code `.jsonl` schema adapter (`detectTranscriptFormat`, `message.usage` deduplication by `message.id`, and explicit `conversation.warning` on missing/unrecognized transcripts) plus `sanitizeUserTurnText` filtering (`isMeta`, `Base directory for this skill:`, `<command-name>`, `<pasted_content>`, and fenced code blocks) in `okf-learn/scripts/learn.js` and `okf-maintain/scripts/maintain.js`; added same-commit co-modification drift tolerance (`isCoModifiedInLatestCommit`) and concept-to-concept frontmatter timestamp resolution (`getResourceEffectiveModifiedISO`) in `okf-lint/scripts/lint.js` and `okf-maintain/scripts/maintain.js`; updated `updateIndexFrontier` in `okf-maintain/scripts/maintain.js` to report and log exact frontier deltas (`+X new, -Y removed, Z already listed`); and added Step 19f regression tests (including curated `## Not yet specified` preservation) in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 4 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-learn-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 4 drifted concept(s): concepts/git-development-workflow.md, concepts/knowledge-loop.md, concepts/okf-upgrade-skill.md, concepts/skill-catalog-sync.md.

## 2026-11-05
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/okf-learn-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 7 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md, concepts/okf-upgrade-skill.md, concepts/skill-catalog-sync.md.
- Applied `/okf-learn` cross-session retrospective improvements across `okf-query/scripts/query.js` (Tier 1A direct concept `.md` file matching in `--file` and multi-argument space-separated `--file` / `--search` parsing), `okf-maintain/scripts/maintain.js` (`isHashedBuildAsset` and `.bin`/`.rdb`/`scratch/` frontier exclusion plus `healStaleHashedAssetBindings` auto-healing for Vite/Webpack hashed bundle paths in `sources:`), `okf-learn/scripts/learn.js` (`inferWorkspaceFromPath`, `read_file` false-positive filtering for `queryMisses`/`contextBloat`, and `okf/index.md` grounding credit), `okf-upgrade/SKILL.md`, `okf-learn/SKILL.md`, and `scripts/test-lifecycle.js`.
- Synchronized timestamp for 7 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-course.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-upgrade-skill.md, concepts/skill-catalog-sync.md.
- Synchronized skill and lifecycle step counts across `okf-upgrade/SKILL.md`, `index.html`, `course.html`, `docs/course/01-why-okf-and-codebase-amnesia.md`, `docs/course/07-capstone-self-documenting-repo.md`, and `scripts/test-lifecycle.js`, and added `okf-upgrade/SKILL.md` to `verifyCatalogInvariants()` in `scripts/sync-skills.js`.
- Synchronized timestamp for 4 drifted concept(s): concepts/git-development-workflow.md, concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/skill-catalog-sync.md.
- Added `docs/okf/concepts/skill-catalog-sync.md` ("Skill Lifecycle & Documentation Synchronization Playbook") and extended `scripts/sync-skills.js` (`verifyCatalogInvariants`, `buildSyncedReadmeMd`, and `s11l-panel-1` mapping) to automatically synchronize and enforce catalog parity across `README.md`, `index.html` (adding Step 11 `/okf-learn` card and code tabs), `okf-upgrade/scripts/upgrade.js`, `install.ps1`, `install.sh`, and `docs/okf/index.md` whenever skills are added, modified, or deleted.
- Synchronized timestamp for 2 drifted concept(s): concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md.
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-maintain-skill.md.
- Enhanced `okf-learn` (`okf-learn/scripts/learn.js`, `okf-learn/SKILL.md`) and `okf-maintain` (`okf-maintain/scripts/maintain.js`, `okf-maintain/SKILL.md`) with conditional agent-invocation and centralized cross-repo skill evolution: smart `--latest` selection that skips `<6` step meta-sessions to evaluate the most recent substantive coding session across workspaces, `--recent [N]` multi-session aggregation, `--note "<message>" [--skill <name>]` / `--clear-notes` cross-repo skill learning queue (`~/.okf/skill-learnings.jsonl`), and missed-file details plus `okf-learn` invocation instructions in the `[OKF Self-Improvement]` pre-completion nudge.
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-upgrade-skill.md, concepts/skill-installers.md.
- Promoted the session and telemetry self-improvement workflow into the dedicated `okf-learn` skill (`okf-learn/SKILL.md`, `okf-learn/scripts/learn.js`, `docs/okf/concepts/okf-learn-skill.md`) with qualitative lesson extraction (`learningSignals.userCorrections`, `learningSignals.oversizedConcepts`) and automated `--bind <file> --concept <concept>` source binding remediation; registered `okf-learn` across `scripts/sync-skills.js`, `okf-upgrade/scripts/upgrade.js`, `install.ps1`, `install.sh`, `package.json`, and `scripts/test-parser.js`; and added Step 23 regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 4 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md.
- Added multi-file `--file <path1,path2,...>` deduplication and a 24,000-character cumulative body budget (`MAX_TOTAL_BODY_CHARS`) in `okf-query/scripts/query.js` so multi-concept and multi-file queries stay under the 40KB bloat threshold by default; refined `evaluateSkillsPerformance` in `okf-maintain/scripts/maintain.js` to require both `OKF CONTEXT BLOCK` and `>40KB` size when flagging transcript `contextBloat`; and added Step 22e regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 5 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md.
- Added the 3-part Skill Self-Improvement Pipeline across `okf-query/scripts/query.js`, `okf-maintain/scripts/maintain.js`, and `okf-lint/scripts/lint.js`: passive zero-token CLI telemetry (`~/.okf/telemetry.jsonl` via `recordTelemetry`), pre-completion anomaly nudges (`checkSessionAnomaliesForNudge`), and the 1-command session transcript & telemetry evaluator (`node okf-maintain/scripts/maintain.js --evaluate [conversation-id | --latest] [--json] [--reset]` via `evaluateSkillsPerformance`), plus Step 22 regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 5 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md.

## 2026-11-04
- Optimized `okf-query/scripts/query.js` with primary (`resource`, `computation`, `executor.resource`, `attester.resource`) vs. secondary (`sources`) `--file` ranking, path-suffix and basename fallback when a queried relative path does not exist on disk, header-weighted `--search` ranking, and default full-body output budgeting (top 3 `--file` + all primary matches; top 5 `--search` matches, with `--full` override); replaced per-file `git log -1` process spawns in `okf-maintain/scripts/maintain.js` and `okf-lint/scripts/lint.js` with batched repository-wide `getRepoCommitTimeMap` (~25x faster drift checks on Windows); and added Step 21 regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-maintain-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-wayfinder-skill.md.
- Updated `okf-maintain/scripts/maintain.js` (`resolveSkillsBase` & `inspectAndSyncSteeringFile`) to emit forward-slash absolute paths instead of `~/` on Windows (`win32`, since PowerShell does not expand `~/` when passed as an argument to `node`) and auto-heal existing Windows steering files containing `node ~/`; added static media, font, office document, and archive extensions (`.jpg`, `.png`, `.svg`, `.pdf`, `.xlsx`, `.zip`, `.pkpass`, etc.) to `IGNORED_FRONTIER_EXTENSIONS` in `okf-maintain/scripts/maintain.js` and `okf-wayfinder/scripts/wayfinder_taxonomy.js`; added unindexed active concept detection (`findUnindexedConcepts`) and auto-indexing (`updateIndexConcepts`) into `index.md` in `okf-maintain/scripts/maintain.js`; refined comma-separated `resource:` splitting in `okf-upgrade/scripts/upgrade.js` to filter to existing paths and avoid duplicating `resource` in `sources`; and added Step 20 regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 3 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-maintain-skill.md, concepts/okf-upgrade-skill.md.
- Synchronized timestamp for 5 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-maintain-skill.md, concepts/okf-upgrade-skill.md, concepts/skill-installers.md.
- Extended `okf-upgrade` (`okf-upgrade/scripts/upgrade.js`, `okf-upgrade/SKILL.md`) with `--skills`/`--self` and `--all` multi-agent skill self-update flags (discovering and syncing `~/.gemini/config/skills`, `~/.claude/skills`, `~/.claude-*/skills`, `$CLAUDE_CONFIG_DIR/skills`, `~/.codex/skills`, `~/.codex-*/skills`, `$CODEX_HOME/skills`, and `~/.agents/skills`, plus fast-forwarding `~/okf-skills` when present); added OpenAI Codex profile discovery to `install.ps1` and `install.sh`; and added Step 19 regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 8 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-wayfinder-skill.md.
- Fixed `resolveResourceLocalPath` across `okf-lint`, `okf-maintain`, `okf-query`, `okf-wayfinder`, and `okf-prune` to decode percent-encoded `file://` URIs (e.g. `%20`), strip `#fragment`/`?query` suffixes, and ignore non-path URI schemes such as `git:<sha>:<path>`; fixed `extractLinks` in `okf-lint` and `okf-prune` (and `autoFixBareLinks` in `okf-upgrade`) to preserve backtick-wrapped link labels (`[\`label\`](target)`) instead of stripping them to `''`; hardened `updateIndexFrontier` and `scanWorkspaceFiles` in `okf-maintain` (and `scanWorkspace` in `okf-wayfinder`) to never delete hand-written single-line or multi-line notes in `## Not yet specified`, recognize files acknowledged across the entire bundle (including backtick filenames and ellipsis-abbreviated `` `…<suffix>` `` references), skip `README.md`/steering files and child sub-packages with their own nested OKF bundles, exempt reserved bundle files (`log.md`, `index.md`, `viz.html`) from triggering concept drift, and insert new `## YYYY-MM-DD` headings at the top of bullet-dated `log.md` files; and added Step 18 regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 9 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-wayfinder-skill.md, concepts/skill-installers.md.
- Fixed monorepo sub-package `--bundle` `workspaceRoot` resolution across `okf-lint`, `okf-maintain`, `okf-query`, `okf-prune`, `okf-upgrade`, and `okf-wayfinder`; enhanced `okf-upgrade` to strip non-`okf_version` keys from root `index.md` (§12), normalize bullet-dated `log.md` entries, split comma-separated local `resource:` paths, and preserve CRLF/LF line endings; updated `okf-maintain` and `okf-wayfinder` frontier scanning to inherit ancestor `.gitignore` files and exclude `__pycache__`/bytecode artifacts while pruning deleted/excluded frontier bullets in `updateIndexFrontier`; updated `install.ps1` and `install.sh` to sync all `~/.claude-*` profile directories; and added Step 17 regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md.
- Added same-commit timestamp drift tolerance (`getEffectiveConceptTime`) in `okf-lint/scripts/lint.js` and `okf-maintain/scripts/maintain.js`, missing local `resource:`/`sources:` warnings in `okf-lint/scripts/lint.js`, multi-word tokenized `--search` (`tokenizeSearchQuery`) in `okf-query/scripts/query.js`, cross-branch bundle detection hints (`findBundlesOnOtherBranches`) and CRLF steering preservation in `okf-maintain/scripts/maintain.js`, CRLF preservation in `okf-prune/scripts/prune.js`, and external `--bundle <path>` workspace root resolution (`resolveWorkspaceAndBundle`) across `okf-lint`, `okf-maintain`, `okf-query`, and `okf-prune`; added Step 16 regression tests in `scripts/test-lifecycle.js`.

## 2026-11-03
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-wayfinder-skill.md.
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-wayfinder-skill.md.
- Updated `okf-maintain/scripts/maintain.js`, `okf-wayfinder/scripts/wayfinder_taxonomy.js`, and `okf-lint/scripts/lint.js` to skip active/nested OKF bundle directories during frontier scans, cover child files under directory resource bindings (`isCoveredByResource` + directory dirty-file drift checks), preserve prose and trailing `## ` sections (e.g. `## Provenance`, `## Archived Concepts`) and CRLF/LF line endings when updating `## Not yet specified` in `index.md`, treat files mentioned anywhere in `index.md` as listed, and self-heal stale bundle-internal bullets; added Step 15g regression tests in `scripts/test-lifecycle.js`.
- Synchronized timestamp for 5 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md.
- Synchronized timestamp for 5 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-query-skill.md.

## 2026-11-02
- Synchronized timestamp for 1 drifted concept(s): concepts/okf-prune-skill.md.
- Synchronized timestamp for 1 drifted concept(s): concepts/okf-prune-skill.md.
- Synchronized timestamp for 10 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md.
- Synchronized steering notice in `AGENTS.md` to v1.8.2.
- Synchronized timestamp for 10 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md.
- Made `viz.html` generation strictly on-demand (`okf-visualize` or explicit `--viz` flag) in `okf-maintain/scripts/maintain.js` and `okf-prune/scripts/prune.js`, removed `and viz.html` from the steering template, and bumped suite/steering version to `1.8.2`.
- Synchronized timestamp for 10 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md.
- Synchronized timestamp for 2 drifted concept(s): concepts/okf-maintain-skill.md, concepts/okf-skill.md.
- Synchronized timestamp for 10 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md.
- Synchronized steering notice in `AGENTS.md` to v1.8.1.
- Bumped `TARGET_STEERING_VERSION`, `INSTALLED_VERSION`, `package.json`, and all `SKILL.md` files to `1.8.1` so `okf-maintain` automatically upgrades existing `1.8.0` steering notices to the compact, install-path-aware steering template; hardened `resolveSkillsBase` against local `.agents/skills` mirrors; and connected `index.html` Details Panel 4 to `buildSteeringDirectivesBlock` in `scripts/sync-skills.js`.
- Rewrote the agent steering template (`buildSteeringDirectivesBlock` in `okf-maintain/scripts/maintain.js`): about 60% shorter and no longer repeats instructions. Commands now use the real skill install path (new `resolveSkillsBase`), the bundle path has no leading slash, and the `npm run okf:*` aliases (which don't exist in consumer repos) are gone. All strings checked by lint and the tests are kept. Regenerated `AGENTS.md` and documented the template in [OKF Maintain Skill](/concepts/okf-maintain-skill.md).
- Synchronized timestamp for 2 drifted concept(s): concepts/okf-maintain-skill.md, concepts/okf-skill.md.
- Synchronized timestamp for 9 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md.
- Synchronized timestamp for 3 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-maintain-skill.md.
- Added canonical shared OKF core module (`scripts/lib/okf-core.js`) and automated skill & `index.html` synchronizer (`scripts/sync-skills.js`, `npm run okf:sync`, `npm run okf:sync:check`), integrated directly into `okf-maintain/scripts/maintain.js` and `scripts/test-parser.js`.
- Synchronized timestamp for 2 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-lint-skill.md.
- Synchronized timestamp for 1 drifted concept(s): concepts/okf-lint-skill.md.
- Synchronized timestamp for 1 drifted concept(s): concepts/knowledge-loop.md.
- Synchronized timestamp for 9 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-upgrade-skill.md, concepts/okf-visualize-skill.md, concepts/okf-wayfinder-skill.md.
- Completed full-suite OKF Specification v0.2 & v1.8.0 evolution across all 8 skills (`okf`, `okf-wayfinder`, `okf-upgrade`, `okf-query`, `okf-prune`, `okf-lint`, `okf-maintain`, `okf-visualize`):
  - `okf-upgrade`: Fixed `serializeFrontmatter` to preserve both shorthand string `sources` and structured `sources` objects (`id`, `resource`, `title`, `author`, `usage_count`, `last_modified`), added `sources[].author` actor normalization, `--bundle <path>`, and `archive/` filtering.
  - `okf-query`: Added `--file` and `--search` matching across `computation`, `executor.resource`, `attester.resource`, `runtime`, and Tier 1/Tier 2 shorthand & structured `sources`, plus `archive/` exclusion.
  - `okf-prune`: Updated `--ghosts` to inspect shorthand & object `sources`, `computation`, `executor.resource`, and `attester.resource` while excluding non-`file://` URIs and scope descriptors, and updated `--orphans` to count `sources` concept lineage links.
  - `okf-lint`: Added lifecycle `status` (`draft | stable | deprecated`) validation, `sources` object & `[^id]` footnote attribution checks, `# Computation` (§10.3) verification, and `--drift` checks on `computation`, `executor.resource`, and `attester.resource`.
  - `okf-maintain`: Added drift detection & timestamp sync on `computation`, `executor.resource`, and `attester.resource`, plus non-`file://` URI and scope descriptor filtering.
  - `okf-visualize`: Added `archive/` filtering, expanded `TYPE_PALETTE`, added `Attested Computation` lineage edges and sidebar metadata (`Generated`, `Runtime`, `Computation`, `Parameters`, `Executor`, `Attester`, `Usage Window`, and shorthand/structured `Sources`).
  - Synchronized all `SKILL.md` versions to `1.8.0`, updated `/docs/okf/concepts/*.md`, `index.html`, and `scripts/test-lifecycle.js` (Step 15).
- Synchronized timestamp for 4 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-maintain-skill.md, concepts/okf-wayfinder-skill.md.
- Enhanced `okf-wayfinder/scripts/wayfinder_taxonomy.js` with OKF v0.2 Attested Computation resource tracking (`computation`, `executor.resource`, `attester.resource`), case-insensitive cross-platform resource matching, `archive/` and nested git repository filtering, `--bundle <path>` flag, active concept/layout metadata (`concepts`, `conceptCount`, `layoutMode`, `subdirectories`), module-level frontier clustering (`frontierGroups`), and `--inspect <file>` codebase & Git telemetry extraction.
- Upgraded `okf-wayfinder/SKILL.md` with full 6-file multi-agent steering parity, clustered frontier proposals, structured question tool guidance (`ask_question` / `AskUserQuestion`), `--inspect` draft scaffolding, type-aware focus questions, `human-reviewed` trust tier attestation (`verified`), and post-authoring `okf-maintain` + `okf-lint --drift` verification.
- Updated `okf-maintain/scripts/maintain.js` to skip nested git repositories in `scanWorkspaceFiles` and `archive/` folders in `walkConceptFiles`.
- Synchronized `docs/okf/concepts/okf-wayfinder-skill.md`, `index.html` (Details Panel 3), `package.json` (`okf:wayfinder`), and `scripts/test-lifecycle.js` (Step 14).

## 2026-10-29
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-skill.md, concepts/okf-wayfinder-skill.md.
- Synchronized timestamp for 6 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-lint-skill.md, concepts/okf-maintain-skill.md, concepts/okf-skill.md, concepts/okf-wayfinder-skill.md.
- Bumped `TARGET_STEERING_VERSION`, `INSTALLED_VERSION`, and `package.json` to `1.8.0`, adding **Model-Tier Routing** (Step 4 in `## ⚡ Pre-Work Grounding Gate` and Medium-tier upkeep guidance in `## ⚡ Pre-Completion Verification Gate`) across `okf/SKILL.md`, `okf-wayfinder/SKILL.md`, `okf-maintain/SKILL.md`, `okf-maintain/scripts/maintain.js`, `okf-lint/scripts/lint.js`, `AGENTS.md`, and `index.html`.
- Updated `scripts/test-lifecycle.js` to verify `v1.8.0` steering auto-healing and `Model-Tier Routing` injection across agent steering files.

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
- Incorporated the comprehensive [Git Development and Pull Request Workflow](/concepts/git-development-workflow.md) playbook into the bundle, superseding the previous development-workflow stub with detailed guidelines on branch naming, PR sizing, commit grouping, verification gates, rebase-merges, and AI coding agent mandates.

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

## 2026-11-09
- Synchronized timestamp for 9 drifted concept(s): concepts/interactive-simulator.md, concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/okf-prune-skill.md, concepts/okf-query-skill.md, concepts/okf-skill.md, concepts/okf-upgrade-skill.md, concepts/skill-catalog-sync.md.
- Synchronized timestamp for 4 drifted concept(s): concepts/knowledge-loop.md, concepts/okf-learn-skill.md, concepts/okf-maintain-skill.md, concepts/skill-catalog-sync.md.
