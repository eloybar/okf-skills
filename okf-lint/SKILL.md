---
name: okf-lint
description: Statically analyze the OKF knowledge bundle to check conformance, link integrity, and concept drift.
version: 1.3.0
---

# `okf-lint` Workflow

Ensure the OKF bundle remains conformant and up-to-date with code changes.

## Usage

```bash
# Run basic conformance and link integrity checks (broken links reported as warnings per §6.1)
node okf-lint/scripts/lint.js

# Run checks including Git modification-based concept drift analysis
node okf-lint/scripts/lint.js --drift

# Enforce strict link resolution (broken links fail build)
node okf-lint/scripts/lint.js --strict-links
```

## Steps

1. **Verify Conformance**
   - Parse all `.md` concept files in the bundle.
   - Verify each file has parseable YAML frontmatter containing a non-empty `type`.
   - Verify reserved files (`index.md` frontmatter rules §8, §12 and `log.md` date headings §9).
   - Check actor format syntax `<producer>/<version>`, `human:<id>`, or `process:<id>` (§7).

2. **Verify Link Integrity**
   - Extract internal Markdown link references matching `[Label](/concepts/target.md)`.
   - Confirm that the targeted concept file exists in the bundle.
   - Per OKF v0.2 §6.1, broken links are tolerated and flagged as warnings by default; use `--strict-links` to treat them as hard build errors.

3. **Check Concept Drift (`--drift`)**
   - For every concept with a valid `resource` (e.g. `file:///path/to/file` or local paths) or `sources` resource:
     - Query Git for the last commit date of the resource file:
       `git log -1 --format="%aI" -- <file-path>`
     - Compare this ISO timestamp with the concept's `generated.at` timestamp (falling back to legacy `timestamp` if `generated.at` is not present).
     - If the resource file was modified after the concept's timestamp, flag a warning to alert the user that the concept is out of sync.

4. **Verify Attested Computations**
   - For concepts with `type: Attested Computation`, ensure `runtime` is present and referenced files (`computation`, `executor.resource`, `attester.resource`) exist on disk.
