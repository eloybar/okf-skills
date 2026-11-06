---
name: okf-maintain
description: Use after changing or learning something about a codebase that has an okf/ knowledge bundle, so the bundle doesn't go stale. Fires when your edits touch code an existing OKF concept documents, or when you discover a fact a concept should record.
version: 1.8.2
---

Keep an existing **OKF bundle** current so it doesn't rot. This skill handles both reactive upkeep of existing files and the automatic authoring of new concept files when new significant components, schemas, or modules are introduced to the codebase. (For specific frontmatter/conformance rules, follow the `okf` skill, which is the single source of truth for how a concept is written).

> **Model-Tier Steering:** Post-implementation upkeep (`okf-maintain`) should run on the **Medium** setting of the active model once the implementation plan has been laid out and executed. Reserve the **High** setting for initial bundle bootstrapping (`okf`, `okf-wayfinder`) or architectural planning.

### ⚡ Fast Mechanical Upkeep (CLI Automation)
Whenever code modifications touch existing resources or introduce untracked workspace files, run the automated maintainer script (you can run `--check` first to preview drift and unindexed frontier changes without mutating files):
```bash
node okf-maintain/scripts/maintain.js --check # Audit mode: previews drift, unindexed concepts, and frontier without mutating files
node okf-maintain/scripts/maintain.js        # Auto-syncs drift timestamps, frontier, steering, and log (add --viz to rebuild viz.html)
node okf-maintain/scripts/maintain.js --evaluate --latest # Self-improvement analyzer: evaluates session transcript & ~/.okf/telemetry.jsonl
```
This automatically updates timestamps for drifted concepts, surgically updates managed `- \`<path>\` — Undocumented codebase file.` bullets in `## Not yet specified` in `index.md` (preserving curated multi-line notes and prose byte-for-byte), prints and logs the exact frontier delta (`+X new, -Y removed, Z already listed`), and runs `okf-lint --drift` (pass `--viz` or run `okf-visualize` to generate `viz.html`).

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

## Reorganization & Link Upkeep

- **Scale Trigger:** When a concept addition pushes the root concepts count past 10, check if the bundle should transition to a nested layout. Recommend this restructure to the user before executing.
- **Link Refactoring:** When moving concept files, update all bundle-relative links in the body of all affected files (e.g., rewrite `[Auth](/auth.md)` to `[Auth](/subsystems/auth.md)`) and refresh the `index.md` listing.
