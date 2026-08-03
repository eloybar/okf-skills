---
name: okf-lint
description: Statically analyze the OKF knowledge bundle to check conformance, link integrity, and concept drift.
version: 1.3.0
---

# `okf-lint` Workflow

Ensure the OKF bundle remains conformant and up-to-date with code changes.

## Usage

```bash
# Run basic conformance and link integrity checks
node okf-lint/scripts/lint.js

# Run checks including Git modification-based concept drift analysis
node okf-lint/scripts/lint.js --drift
```

## Steps

1. **Verify Conformance**
   - Parse all `.md` concept files in the bundle.
   - Verify each file has parseable YAML frontmatter containing a non-empty `type`.

2. **Verify Link Integrity**
   - Extract internal Markdown link references matching `[Label](/concepts/target.md)`.
   - Confirm that the targeted concept file exists in the bundle.

3. **Check Concept Drift (`--drift`)**
   - For every concept with a valid `resource` (e.g. `file:///path/to/file` or local paths):
     - Query Git for the last commit date of the resource file:
       `git log -1 --format="%aI" -- <file-path>`
     - Compare this ISO timestamp with the concept's `timestamp`.
     - If the resource file was modified after the concept's timestamp, flag a warning to alert the user that the concept is out of sync.
