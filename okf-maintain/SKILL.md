---
name: okf-maintain
description: Use after changing or learning something about a codebase that has an okf/ knowledge bundle, or when verifying concepts, renewing stale_after deadlines, pruning stale/deprecated/ghost/orphaned concepts, upgrading v0.1 bundles, or updating installed OKF skills.
version: 1.8.2
---

Keep an existing **OKF bundle** current, verified, and clean so it doesn't rot. This skill handles reactive upkeep of existing files, automatic authoring of new concept files, concept verification (`verified:` & `stale_after:`), lifecycle pruning/archiving (`--prune`), bundle format upgrades (`--upgrade`), and multi-agent skill updates (`--skills`). (For specific frontmatter/conformance rules, follow the `okf` skill, which is the single source of truth for how a concept is written).

> **Model-Tier Steering:** Post-implementation upkeep (`okf-maintain`) should run on the **Medium** setting of the active model once the implementation plan has been laid out and executed. Reserve the **High** setting for initial bundle bootstrapping (`okf`, `okf-wayfinder`) or architectural planning.

### ⚡ Fast Mechanical Upkeep, Verification, Pruning & Upgrade (CLI Automation)
Whenever code modifications touch existing resources or introduce untracked workspace files, or when you need to verify concepts, prune stale/deprecated/ghost/orphaned concepts, or upgrade bundles/skills, run the automated maintainer CLI:
```bash
# 1. Standard Drift & Frontier Sync
node okf-maintain/scripts/maintain.js --check # Audit mode: previews drift, unindexed concepts, and frontier without mutating files
node okf-maintain/scripts/maintain.js        # Auto-syncs drift timestamps, frontier, steering, and log (add --viz to rebuild viz.html)

# 2. Concept Verification & Stale-After Renewal (Elevates Trust Tier to human-reviewed or machine-confirmed)
node okf-maintain/scripts/maintain.js --verify concepts/auth.md [--by human:alice] [--stale-after 90d|2027-01-01|none]
node okf-maintain/scripts/maintain.js --verify --all-stale [--stale-after 90d] # Re-verify all expired stale_after concepts
node okf-maintain/scripts/maintain.js --verify --all [--by human:alice]        # Stamp verified: across all active concepts

# 3. Lifecycle Pruning & Garbage Collection (Archives or deletes stale, deprecated, ghost, or orphaned concepts)
node okf-maintain/scripts/maintain.js --prune --check [--stale|--deprecated|--ghosts|--orphans]
node okf-maintain/scripts/maintain.js --prune          # Default safe mode: moves prunable concepts to archive/ and updates index.md & log.md
node okf-maintain/scripts/maintain.js --prune --delete # Permanently deletes prunable concepts

# 4. Bundle Upgrader (v0.1 -> v0.2) & Multi-Agent Skill Updater
node okf-maintain/scripts/maintain.js --upgrade [--bundle <path>] # Upgrades v0.1 timestamps, # Citations, bare links, and actor formats
node okf-maintain/scripts/maintain.js --upgrade --skills          # Self-updates all 7 OKF skills across Antigravity, Claude, Codex, and Universal

# 5. Session & Telemetry Self-Improvement Audit
node okf-maintain/scripts/maintain.js --evaluate --latest
```
The default sync automatically updates timestamps for drifted concepts, surgically updates managed `- \`<path>\` — Undocumented codebase file.` bullets in `## Not yet specified` in `index.md` (preserving curated multi-line notes and prose byte-for-byte), prints and logs the exact frontier delta (`+X new, -Y removed, Z already listed`), and runs `okf-lint --drift` (pass `--viz` or run `okf-visualize` to generate `viz.html`).

> **Conditional `okf-learn` Agent Trigger:** If `maintain.js` outputs a `💡 [OKF Self-Improvement]` anomaly nudge at the end of its run (e.g., reporting `query_miss`, `context_bloat`, or `slow_exec`), immediately invoke the `okf-learn` skill: bind missed workspace files into the relevant concept via `node okf-learn/scripts/learn.js --bind <file> --concept <concept>` or queue a cross-repo skill improvement note via `node okf-learn/scripts/learn.js --note "<finding>" --skill <skill-name>`.

### Semantic Maintenance & New Concepts

1. **Guard: confirm a bundle exists.** Look for an `okf/` directory at the repo root (or the bundle root this repo uses). If there is none, stop — there is nothing to maintain.
   - Done when you have the bundle root, or have stopped.

2. **Identify affected and missing concepts.** Map what changed (files edited/created, features added, facts learned) to the concept file(s) that cover it. Check `index.md` if present. If your changes introduced a new significant database schema/collection, API route module, frontend dashboard page, core system component, platform-specific/sandbox constraint (e.g., mobile WebView/in-app browser quirks, CORS limitations, CDN asset blockages), developer utility page (like testing environments), or a new codebase behavior or pattern that warrants a permanent engineering guideline, identify it as a concept that must be updated or created. Track any undocumented files (the "frontier") to be indexed in the `index.md` under `## Not yet specified`.
   - Done when you have the list of concepts to update and new concepts to create, or have confirmed none apply (then stop).

3. **Update and/or create concepts.** Edit existing affected concepts to match reality. If you identified missing concepts in Step 2, you can invoke the `okf-wayfinder` skill to guide the authoring of new concept files by interviewing the developer. In both cases: set or refresh the `generated` frontmatter block (updating `at` with the current UTC ISO timestamp using `date -u +%Y-%m-%dT%H:%M:%SZ` and setting/preserving `by` with standard actor format `<producer>/<version>`, `human:<id>`, or `process:<id>`), update `sources` if references changed, cross-link related concepts, and follow the `okf` skill guidelines for frontmatter and structure.
   - Done when every affected concept reflects the change and all new concepts are authored.

4. **Update reserved files.** Append a dated line to `log.md` under an ISO 8601 `## YYYY-MM-DD` date heading describing the changes and additions. If you added a new concept, add it to `index.md` (and remove it from `## Not yet specified` if it was there). If any new undocumented workspace files are identified, list them under the `## Not yet specified` section of `index.md` to map the known frontier.
   - Done when `log.md` records the change and `index.md` lists any new concept and updates the undocumented frontier list — for each reserved file the bundle uses.

5. **Steering Notice Upkeep.** Check if any agent steering files in the workspace root (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, or `GEMINI.md`) contain OKF directives. If any contain the version comment `<!-- okf-steering-version: 1.8.2 -->` or mention OKF, verify they are at version `1.8.2` with both the Pre-Work Grounding Gate (including Step 4: Model-Tier Routing) and the Pre-Completion Verification Gate (including Step 1: Semantic Concept & Source Binding Upkeep). If the comment is missing or references a version older than `1.8.2`, automatically update or overwrite the steering directives block without prompting for user confirmation (or run `node okf-maintain/scripts/maintain.js`), as this is a required conformance gate.
   - Done when all present OKF steering notices contain the correct up-to-date directives and the `<!-- okf-steering-version: 1.8.2 -->` comment.

6. **Conformance gate.** Verify the bundle still conforms, per the `okf` skill.
   - Done when every non-reserved `.md` has parseable frontmatter with a non-empty `type`.

## Concept Verification, Pruning & Skill Self-Update Reference

- **Verification (`--verify` & `--stale-after`):**
  - Appends/updates `verified: [{ by: <actor>, at: <ISO-now> }]` (defaulting `--by` to `human:<git-user-slug>`) to elevate a concept's Trust Tier (`human-reviewed` for `human:<id>`, `machine-confirmed` for `<producer>/<version>` or `process:<id>`).
  - Supports `--stale-after <days>d` (e.g., `90d`), explicit `YYYY-MM-DD` or ISO timestamp, or `none` (or `--clear-stale`) to remove `stale_after`. When `--verify` is run on a concept with an expired `stale_after` without `--stale-after`, it automatically rolls `stale_after` forward by `+90d`.
- **Lifecycle Pruning (`--prune`, `okf-maintain/scripts/prune.js`):**
  - Audits (`--check` / `--dry-run`), archives (default, moving to `archive/` with `status: deprecated`), or permanently deletes (`--delete`) concepts matching `--stale` (`now >= stale_after`), `--deprecated` (`status: deprecated`), `--ghosts` (missing local `resource`/`sources`/`computation` files), or `--orphans` (0 inbound links, including transitive orphans).
- **Bundle Migration & Skill Sync (`--upgrade`, `okf-maintain/scripts/upgrade.js`):**
  - Migrates legacy OKF v0.1 bundles (`timestamp` -> `generated`, `# Citations` -> `sources`, `index.md` `okf_version: "0.2"`, `agent:` actor prefix stripping, comma-separated `resource` splitting, `log.md` date heading normalization, bare link auto-fixing).
  - Running `--upgrade --skills` (or `--skills` / `--all`) synchronizes all 7 OKF skills (`okf`, `okf-maintain`, `okf-visualize`, `okf-wayfinder`, `okf-lint`, `okf-query`, `okf-learn`) across `~/.gemini/config/skills`, `~/.claude/skills`, `~/.claude-*/skills`, `$CLAUDE_CONFIG_DIR/skills`, `~/.codex/skills`, `~/.codex-*/skills`, `$CODEX_HOME/skills`, and `~/.agents/skills`, and automatically removes deprecated legacy skill folders (`okf-prune`, `okf-upgrade`).

## Reorganization & Link Upkeep

- **Scale Trigger:** When a concept addition pushes the root concepts count past 10, check if the bundle should transition to a nested layout. Recommend this restructure to the user before executing.
- **Link Refactoring:** When moving concept files, update all bundle-relative links in the body of all affected files (e.g., rewrite `[Auth](/auth.md)` to `[Auth](/subsystems/auth.md)`) and refresh the `index.md` listing.
