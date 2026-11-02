# Agent Steering & Knowledge Guidelines

Welcome! This codebase is designed as a **self-documenting repository** powered by the **Open Knowledge Format (OKF)**.

## 📂 Knowledge Bundle / OKF
Architecture, contracts and procedures for this repository are documented in the OKF bundle at `docs/okf/` (start at `docs/okf/index.md`). Run OKF tools from the repo root. If nested bundles exist, use the closest parent `okf/` of the file you are working on. At session start, run `node okf-lint/scripts/lint.js --drift`; if it reports drift, run `node okf-maintain/scripts/maintain.js`.

## ⚡ Pre-Work Grounding Gate (MANDATORY)
Before answering questions about the system, planning, or editing:
1. **Search:** `node okf-query/scripts/query.js --search <keywords>` (or read `docs/okf/index.md`).
2. **Per-file context:** `node okf-query/scripts/query.js --file <path>` before analyzing or editing a file; if nothing matches, search by module name.
3. **Cite** the concept(s) you used, or state "OKF Check: no matching concept for <topic>".
4. **Model-Tier Routing:** use the model's **High** setting for bootstrapping, architecture discovery and planning; switch to **Medium** once the plan is approved, for implementation and upkeep.

## ⚡ Pre-Completion Verification Gate (MANDATORY)
Before reporting work complete after changing code:
1. **Semantic Concept & Source Binding Upkeep:** update affected concepts, or create one, when you change a schema, component, API, configuration or build/deploy step, or learn a durable constraint or pattern. Bind new or changed source files in the concept's `resource:`/`sources:` frontmatter, and add a dated line to `docs/okf/log.md`.
2. **Maintain:** `node okf-maintain/scripts/maintain.js` (refreshes timestamps, the `## Not yet specified` frontier, `log.md` and `viz.html`).
3. **Lint:** `node okf-lint/scripts/lint.js --drift`. It must report 0 errors and 0 warnings.

<!-- okf-steering-version: 1.8.1 -->

