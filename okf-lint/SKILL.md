---
name: okf-lint
description: Statically analyze the OKF knowledge bundle to check conformance, link integrity, and concept drift.
version: 1.8.0
---

# `okf-lint` Workflow

Ensure the OKF v0.2 bundle remains conformant, fresh, and synchronized with codebase changes.

## Usage

```bash
# Run conformance, provenance, freshness, and link integrity checks (broken links reported as warnings per §6.1)
node okf-lint/scripts/lint.js [--bundle <path>]

# Run checks including Git + working-tree concept drift and unmapped dirty file analysis
node okf-lint/scripts/lint.js --drift

# Enforce strict link resolution (broken links fail build)
node okf-lint/scripts/lint.js --strict-links

# Emit structured JSON summary for CI/CD and agent tooling
node okf-lint/scripts/lint.js --drift --json
```

## Steps

1. **Verify Conformance & Provenance (§5, §7, §8, §9, §11, §12)**
   - Parse all `.md` concept files in the bundle.
   - Verify each file has parseable YAML frontmatter containing a non-empty `type`.
   - Verify reserved files (`index.md` frontmatter rules §8, §12 and `log.md` `YYYY-MM-DD` date headings §9).
   - Check lifecycle `status` (`draft | stable | deprecated`, §5.4) and actor format syntax `<producer>/<version>`, `human:<id>`, or `process:<id>` across `generated.by`, `verified[].by`, and `sources[].author` (§5.1, §7).
   - Validate structured `sources` entries for required `resource` keys and verify that body footnote citations (`[^id]`) match a declared `sources[].id` (§5.1).

2. **Verify Link Integrity (§6.1)**
   - Extract internal Markdown link references outside code blocks matching `[Label](/concepts/target.md)`.
   - Confirm that the targeted concept file exists in the bundle and uses a descriptive name label rather than a bare filename or URL.
   - Per OKF v0.2 §6.1, broken links are tolerated and flagged as warnings by default; use `--strict-links` to treat them as hard build errors.

3. **Check Concept Drift & Freshness (`--drift`, §5.2, §5.5, §6.2)**
   - For every active concept with local paths in `resource`, `sources` (string or `{ resource }` object), `computation`, `executor.resource`, or `attester.resource`:
     - Compare the latest Git commit (`git log -1 --format="%aI"`) and uncommitted working-tree modification time (`git status --porcelain` + `mtime`) against the concept's `generated.at` (or legacy `timestamp`).
     - Flag a warning if any bound file was modified after the concept's timestamp.
   - Check workspace `git status --porcelain` for modified or added code files not bound to any concept's frontmatter, emitting a `[Drift Warning]`.
   - Validate `stale_after` (§5.5) and warn when `now >= stale_after`.

4. **Verify Attested Computations (§10)**
   - For concepts with `type: Attested Computation`, ensure `runtime` is present, verify that either a `computation` file path or an inline `# Computation` body section is provided (§10.3), and confirm that referenced local files (`computation`, `executor.resource`, `attester.resource`) exist on disk.

5. **Audit Steering Notices (v1.8.0)**
   - Audit all present agent steering files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `GEMINI.md`) in the workspace root for the current template version (`1.8.0`), confirming `Pre-Work Grounding Gate`, `Model-Tier Routing`, and `Pre-Completion Verification Gate` are present.
