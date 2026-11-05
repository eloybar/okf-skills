---
name: okf-upgrade
description: Automatically upgrade an OKF bundle from v0.1 to v0.2 and update installed OKF skills across all agent environments.
disable-model-invocation: true
version: 1.8.2
---

Migrate an existing **OKF bundle** from Version 0.1 to Version 0.2 format, or self-update the installed **OKF skills** across all AI agent environments (Google Antigravity, Claude Code profiles, OpenAI Codex profiles, and universal `.agents/skills`).

## Usage

> **Path Resolution:** When running outside the `okf-skills` repository, use the installed skills base path configured in the workspace's `AGENTS.md` (on Windows PowerShell, use `$HOME/...` or `C:/Users/<user>/...` rather than `~/`, as `node.exe` does not expand `~`).

```bash
# Upgrade the local bundle in the workspace
node okf-upgrade/scripts/upgrade.js [--bundle <path>]

# Update installed OKF skills to the latest version across all agents (Antigravity, Claude, Codex, Universal)
node okf-upgrade/scripts/upgrade.js --skills [--agent All|Antigravity|Claude|Codex|Universal]

# Update installed OKF skills AND upgrade the current workspace bundle in one command
node okf-upgrade/scripts/upgrade.js --all [--bundle <path>]

# Target a specific username for the 'generated.by' metadata fields
node okf-upgrade/scripts/upgrade.js --user "ahormati"
```

## Migration & Self-Update Actions Performed

0. **Multi-Agent Skill Self-Update (`--skills` / `--self` / `--all`)**:
   - Fast-forwards `~/okf-skills` (if present) or fetches the latest `okf-skills` repository from GitHub, and copies all 9 skills (`okf`, `okf-maintain`, `okf-visualize`, `okf-wayfinder`, `okf-lint`, `okf-query`, `okf-upgrade`, `okf-prune`, `okf-learn`) into `~/.gemini/config/skills`, `~/.claude/skills`, `~/.claude-*/skills`, `$CLAUDE_CONFIG_DIR/skills`, `~/.codex/skills`, `~/.codex-*/skills`, `$CODEX_HOME/skills`, and `~/.agents/skills`.

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
