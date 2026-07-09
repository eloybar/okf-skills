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

5. **Steering Notice (AGENTS.md).** If bootstrapping a new bundle or if the repository root-level `AGENTS.md` (or `CLAUDE.md`) does not mention the OKF bundle, create or update it to include instructions telling future agents to read and maintain the OKF directory (e.g., `./okf/` or `./docs/solutions/`).
   - Done when a root-level instruction file exists and directs agents to read and maintain the OKF bundle.

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
