---
name: okf
description: Author and maintain Open Knowledge Format (OKF) bundles — directories of typed markdown concept files.
disable-model-invocation: true
version: 1.4.0
---

Capture knowledge as an **OKF bundle**: a directory of markdown **concept** files, each carrying YAML **frontmatter** plus a free-form body. No SDK, no central authority — readable, diffable, portable. Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

## Authoring a concept

1. **Locate the bundle root.** Find the existing bundle directory, or create one for a new bundle. Concepts live in it, nested in subdirectories as the subject warrants.
   - Done when you have an absolute bundle root and know where this concept's file goes.

2. **Write the concept file.** One `.md` file per concept: a frontmatter block delimited by `---`, then the markdown body. See **Frontmatter** and **Body** below.
   - Done when the file has parseable YAML frontmatter with a non-empty `type`, and a body that stands on its own to a reader with no tools.

3. **Cross-link.** Link related concepts inline in the body with bundle-relative absolute paths: `[Orders table](/schemas/orders.md)`. Links assert plain, untyped relationships. A link to a concept you haven't written yet is fine — broken links are tolerated.
   - Done when every related concept you reference is linked.

4. **Update reserved files.** If the bundle has an `index.md`, add the new concept to it. Append a dated line to `log.md` if one exists. If bootstrapping a new bundle, ensure the root `index.md` contains the frontmatter `okf_version: 0.2`. See **Reserved files**.
   - Done when `index.md` lists the concept and `log.md` records the change — for each reserved file the bundle actually uses.

5. **Steering Notice (AGENTS.md / CLAUDE.md).** If bootstrapping a new bundle or if the repository root-level steering notice does not mention the OKF bundle, create or update the appropriate agent configuration file depending on the active CLI/agent environment:
   - **Detection**:
     * If the executing agent environment is **Claude Code** (e.g., command is `claude`, or environment variables/tools like `AskUserQuestion` indicate Claude Code), target **`CLAUDE.md`**.
     * If the executing agent environment is **Google Antigravity / Gemini CLI** (e.g., command is `agy`, or tools like `ask_permission`/`ask_question` indicate Antigravity), target **`AGENTS.md`**.
     * Otherwise (e.g. Cursor, Cline, general agents), default to creating **`AGENTS.md`** or **`.cursorrules`** as appropriate.
   - **Content**: 
     * Create or update the selected steering file with a dedicated **Knowledge Bundle / OKF** section.
     * Direct future agent sessions to first verify workspace synchronization on startup (running `okf-lint --drift` to detect drift, and `okf-maintain` to fix/sync any drift).
     * Instruct them to locate and use the **closest parent `okf/` directory** relative to the file they are editing (falling back to the root `okf/` if no local directory exists).
     * Instruct them to ground any initial user questions about the codebase by searching the OKF bundle first (e.g., running `okf-query --search <keywords>` or checking `index.md`) before answering or planning.
     * Instruct them to run `okf-query --file <file-path>` before analyzing/editing files to pull context.
     * Instruct them to maintain the bundle post-edit by running `okf-maintain` followed by `okf-lint` to update or create concepts if they modify schemas/components/APIs, discover platform/sandbox-specific constraints (e.g., mobile WebView quirks, CORS limits, CDN blockages), improve developer utility/test pages, or learn new codebase behaviors/patterns that warrant a permanent guideline.
     * Include the steering version tracking tag at the bottom of the section: `<!-- okf-steering-version: 1.4.0 -->`.
   - Done when the correct root-level agent steering file (`AGENTS.md` or `CLAUDE.md`) exists and contains the tailored OKF steering directives with the version tag.


6. **Conformance gate.** Verify the bundle still conforms. See **Conformance**.
   - Done when every non-reserved `.md` has parseable frontmatter with a non-empty `type`, and each reserved file matches its structure.


## Frontmatter

**Required** — the only hard rule:

- `type` — the kind of concept, non-empty (e.g. `BigQuery Table`, `Playbook`, `Service`, `Metric`, `Attested Computation`). Free-form; pick a consistent vocabulary within a bundle.

**Recommended & Lifecycle / Trust Fields (OKF v0.2)** — add when they apply:

- `title` — display name
- `description` — one-sentence summary
- `resource` — URI of the underlying asset the concept describes
- `tags` — list for cross-cutting categorization
- `status` — lifecycle status: `draft` | `stable` | `deprecated` (defaults to `stable`)
- `stale_after` — ISO 8601 UTC timestamp instant on/after which the concept is considered stale (e.g. `2026-12-31T00:00:00Z`)
- `generated` — structured map recording who produced the concept (`by`, in actor format: `<producer>/<version>` for agents, `human:<id>` for people, or `process:<id>` for automated processes) and when (`at`, ISO 8601 UTC timestamp; run `date -u +%Y-%m-%dT%H:%M:%SZ` — don't guess)
- `verified` — list (or single mapping) of verification events (`- { by: <actor>, at: <ISO-8601> }`). Derives trust tier: `unverified` (no verifier), `machine-confirmed` (automated verifiers), or `human-reviewed` (`human:` verifier).
- `sources` — structured list of references/provenance artifacts the concept derives from:
  - `resource` (REQUIRED): absolute URL, bundle-relative path (`/...`), or scope descriptor.
  - `id`: stable key used for per-claim attribution via footnotes `[^id]`.
  - `title`, `author`, `usage_count`, `last_modified` (ISO 8601).
- `usage_window` — optional sibling of `sources` framing `usage_count`: `{ from: <ISO-8601>, to: <ISO-8601> }`.

**Attested Computations (type: Attested Computation)**:
Carries a sanctioned way to compute a value:
- `runtime` (REQUIRED): execution environment (e.g. `bigquery`, `postgres`, `python`, `dbt`).
- `parameters`: list of typed inputs (`- { name: <str>, type: <str>, required: <bool> }`).
- `computation`: path to an external query/code file (if not provided inline under `# Computation`).
- `executor`: `{ resource: <path-to-skill-or-runner>, receipt: [<fields>] }`.
- `attester`: `{ resource: <path-to-deterministic-verifier-code> }`.

```markdown
---
type: BigQuery Table
title: Orders
description: One row per customer order, partitioned by order date.
resource: bigquery://project.dataset.orders
tags: [sales, core]
status: stable
stale_after: 2026-12-31T00:00:00Z
generated:
  by: human:developer
  at: 2026-08-05T14:08:30Z
verified:
  - by: process:nightly-validator
    at: 2026-08-06T02:00:00Z
sources:
  - id: ga4-schema
    resource: https://developers.google.com/analytics/bigquery/export-schema
    title: GA4 BigQuery Export schema
    author: team:ga4-docs
    last_modified: 2026-08-01T00:00:00Z
---

Orders is the system of record for placed orders.[^ga4-schema]

[^ga4-schema]: GA4 BigQuery Export schema
```

## Body

Free-form markdown. Use these conventional headings when they fit, so consumers find the material where they expect it:

- `# Schema` — structured field/column descriptions
- `# Examples` — usage demonstrations
- `# Computation` — the sanctioned computation block of an `Attested Computation` (when not using external `computation: <file>`)

## Directory Organization & Scaling

To prevent catalog clutter as the number of concepts increases, adhere to the following organization guidelines:
- **Flat Layout (< 10 concepts):** Keep all concepts at the root (`/okf/*.md`) for simpler cross-linking.
- **Nested Layout (>= 10 concepts):** Organize concepts into standard logical subdirectories:
  - `/subsystems/` — Core software modules, services, and API route logic.
  - `/data/` — Database schemas, entity models, and cache configurations.
  - `/operations/` — Deployment scripts, CI/CD, and quality assurance/testing setups.
  - `/playbooks/` — Common procedures, runbooks, and recovery checklists.

## Reserved files

Two reserved filenames, both optional — but if present, keep them current (step 4):

- `index.md` — a listing of the directory's concepts, enabling progressive disclosure of a large bundle. For OKF v0.2, the root `index.md` may include `okf_version: "0.2"` in its frontmatter (no other `index.md` may contain frontmatter).
- `log.md` — an update history, newest changes recorded chronologically. Date headings MUST use ISO 8601 `YYYY-MM-DD` form (e.g. `## 2026-08-24`).

## Conformance

Hard rules — a bundle conforms only if all hold:

1. Every non-reserved `.md` file has parseable YAML frontmatter.
2. Every frontmatter has a non-empty `type`.
3. Reserved files (`index.md`, `log.md`) follow their structures above.

Everything else is soft guidance. When reading a bundle, degrade gracefully: tolerate unknown `type` values, missing recommended fields, and broken links (which may represent not-yet-written knowledge per §6.1) rather than erroring.

