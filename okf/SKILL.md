---
name: okf
description: Author and maintain Open Knowledge Format (OKF) bundles — directories of typed markdown concept files.
disable-model-invocation: true
---

Capture knowledge as an **OKF bundle**: a directory of markdown **concept** files, each carrying YAML **frontmatter** plus a free-form body. No SDK, no central authority — readable, diffable, portable. Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

## Authoring a concept

1. **Locate the bundle root.** Find the existing bundle directory, or create one for a new bundle. Concepts live in it, nested in subdirectories as the subject warrants.
   - Done when you have an absolute bundle root and know where this concept's file goes.

2. **Write the concept file.** One `.md` file per concept: a frontmatter block delimited by `---`, then the markdown body. See **Frontmatter** and **Body** below.
   - Done when the file has parseable YAML frontmatter with a non-empty `type`, and a body that stands on its own to a reader with no tools.

3. **Cross-link.** Link related concepts inline in the body with bundle-relative absolute paths: `[Orders table](/schemas/orders.md)`. Links assert plain, untyped relationships. A link to a concept you haven't written yet is fine — broken links are tolerated.
   - Done when every related concept you reference is linked.

4. **Update reserved files.** If the bundle has an `index.md`, add the new concept to it. Append a dated line to `log.md` if one exists. See **Reserved files**.
   - Done when `index.md` lists the concept and `log.md` records the change — for each reserved file the bundle actually uses.

5. **Steering Notice (AGENTS.md / CLAUDE.md).** If bootstrapping a new bundle or if the repository root-level steering notice does not mention the OKF bundle, create or update the appropriate agent configuration file depending on the active CLI/agent environment:
   - **Detection**:
     * If the executing agent environment is **Claude Code** (e.g., command is `claude`, or environment variables/tools like `AskUserQuestion` indicate Claude Code), target **`CLAUDE.md`**.
     * If the executing agent environment is **Google Antigravity / Gemini CLI** (e.g., command is `agy`, or tools like `ask_permission`/`ask_question` indicate Antigravity), target **`AGENTS.md`**.
     * Otherwise (e.g. Cursor, Cline, general agents), default to creating **`AGENTS.md`** or **`.cursorrules`** as appropriate.
   - **Content**: 
     * Create or update the selected steering file with a dedicated **Knowledge Bundle / OKF** section.
     * Direct future agent sessions to first verify workspace synchronization on startup (checking `git status` and recent commits for code files modified after the `timestamp` in their corresponding concept files, and running `okf-maintain` to sync any drift).
     * Instruct them to locate and use the **closest parent `okf/` directory** relative to the file they are editing (falling back to the root `okf/` if no local directory exists).
     * Instruct them to read `index.md` and relevant concept files in that directory before making modifications, and to run the `okf-maintain` skill (or local equivalent) after changes to keep documentation fresh.
   - Done when the correct root-level agent steering file (`AGENTS.md` or `CLAUDE.md`) exists and contains the tailored OKF steering directives.



6. **Conformance gate.** Verify the bundle still conforms. See **Conformance**.
   - Done when every non-reserved `.md` has parseable frontmatter with a non-empty `type`, and each reserved file matches its structure.


## Frontmatter

**Required** — the only hard rule:

- `type` — the kind of concept, non-empty (e.g. `BigQuery Table`, `Playbook`, `Service`). Free-form; pick a consistent vocabulary within a bundle.

**Recommended** — add when they apply:

- `title` — display name
- `description` — one-sentence summary
- `resource` — URI of the underlying asset the concept describes
- `tags` — list for cross-cutting categorization
- `timestamp` — ISO 8601 last-modified time; use today's date (run `date -u +%Y-%m-%dT%H:%M:%SZ` — don't guess)

```markdown
---
type: BigQuery Table
title: Orders
description: One row per customer order, partitioned by order date.
resource: bigquery://project.dataset.orders
tags: [sales, core]
timestamp: 2026-07-07T00:00:00Z
---

Orders is the system of record for placed orders...
```

## Body

Free-form markdown. Use these conventional headings when they fit, so consumers find the material where they expect it:

- `# Schema` — structured field/column descriptions
- `# Examples` — usage demonstrations
- `# Citations` — external sources this concept draws from

## Reserved files

Two reserved filenames, both optional — but if present, keep them current (step 4):

- `index.md` — a listing of the directory's concepts, enabling progressive disclosure of a large bundle.
- `log.md` — an update history, newest changes recorded chronologically.

## Conformance

Hard rules — a bundle conforms only if all hold:

1. Every non-reserved `.md` file has parseable YAML frontmatter.
2. Every frontmatter has a non-empty `type`.
3. Reserved files (`index.md`, `log.md`) follow their structures above.

Everything else is soft guidance. When reading a bundle, degrade gracefully: tolerate unknown `type` values, missing recommended fields, and broken links rather than erroring.
