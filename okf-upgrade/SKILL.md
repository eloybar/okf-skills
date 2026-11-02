---
name: okf-upgrade
description: Automatically upgrade an OKF bundle from v0.1 to v0.2.
disable-model-invocation: true
version: 1.8.2
---

Migrate an existing **OKF bundle** from Version 0.1 to Version 0.2 format. This skill automates the migration of legacy frontmatter, citations, actor conventions, log headings, and version compatibility flags.

## Usage

```bash
# Upgrade the local bundle in the workspace
node okf-upgrade/scripts/upgrade.js [--bundle <path>]

# Target a specific username for the 'generated.by' metadata fields
node okf-upgrade/scripts/upgrade.js --user "ahormati"
```

## Migration Actions Performed

1. **Frontmatter Upgrade (§5.2, §13.1)**:
   - Replaces the legacy `timestamp: <time>` frontmatter property with the structured `generated` mapping:
     ```yaml
     generated:
       by: human:<user>
       at: <timestamp>
     ```

2. **Citation Migration & Provenance Preservation (§5.1, §13.1)**:
   - Locates the `# Citations` heading in the markdown body, extracts external URLs and markdown links into structured frontmatter `sources` entries, and removes `# Citations` from the body.
   - Preserves both shorthand string `sources` entries and structured provenance objects (`id`, `resource`, `title`, `author`, `usage_count`, `last_modified`, `usage_window`).

3. **Version Check (§8, §12)**:
   - Inserts `okf_version: "0.2"` into the frontmatter of the bundle-root `index.md` file.

4. **Actor Normalization (§5.1, §7)**:
   - Normalizes non-standard `agent:<name>` actor formats in `generated.by`, `verified[].by`, and `sources[].author` to `<producer>/<version>` (e.g. `agent:Antigravity/3.5-Flash` -> `Antigravity/3.5-Flash`).

5. **Log Date Heading Normalization (§9)**:
   - Formats `log.md` date headings to ISO 8601 `YYYY-MM-DD` and merges duplicate consecutive date sections.

6. **Bare Link Auto-Fixing (§6.1)**:
   - Replaces bare/non-descriptive link labels (e.g. `[doc.md](doc.md)`) outside code blocks with the target concept's `title`.

7. **Lint Verification (§11)**:
   - Automatically runs `okf-lint` on the target bundle upon completion to verify compatibility.
