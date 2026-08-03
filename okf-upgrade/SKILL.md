---
name: okf-upgrade
description: Automatically upgrade an OKF bundle from v0.1 to v0.2.
disable-model-invocation: true
version: 1.4.0
---

Migrate an existing **OKF bundle** from Version 0.1 to Version 0.2 format. This skill automates the migration of legacy frontmatter, citations, and adds version compatibility flags.

## Usage

```bash
# Upgrade the local bundle in the workspace
node okf-upgrade/scripts/upgrade.js

# Target a specific username for the 'generated.by' metadata fields
node okf-upgrade/scripts/upgrade.js --user "ahormati"
```

## Migration Actions Performed

1. **Frontmatter Upgrade**:
   - Replaces the legacy `timestamp: <time>` frontmatter property with the structured `generated` parent:
     ```yaml
     generated:
       by: human:<user>
       at: <timestamp>
     ```

2. **Citation Migration**:
   - Locates the `# Citations` heading in the markdown body.
   - Extracts external URLs and markdown links.
   - Converts extracted links into structured frontmatter `sources` entries.
   - Deletes the `# Citations` header and section from the body.

3. **Version Check**:
   - Inserts `okf_version: "0.2"` into the frontmatter of the root `index.md` file.

4. **Lint Verification**:
   - Automatically runs `okf-lint` on completion to verify compatibility.
