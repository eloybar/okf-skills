---
type: Playbook
title: Skill Lifecycle & Documentation Synchronization Playbook
description: Invariants and automated checks ensuring README.md, index.html, installers, tests, and OKF concepts stay 100% synchronized whenever skills are added, modified, or deleted.
resource: scripts/sync-skills.js
status: stable
tags: [synchronization, documentation, skills, simulator, readme, invariants]
generated:
  by: Antigravity/4.0
  at: 2026-11-10T20:27:15.849Z
sources:
  - README.md
  - index.html
  - package.json
  - install.ps1
  - install.sh
  - okf-maintain/scripts/upgrade.js
  - scripts/test-parser.js
  - scripts/test-lifecycle.js
  - docs/okf/index.md
  - okf-maintain/SKILL.md
  - course.html
  - docs/course/01-why-okf-and-codebase-amnesia.md
  - docs/course/07-capstone-self-documenting-repo.md
---

# Overview
Whenever an OKF skill is **added**, **modified**, or **deleted** in this repository, every documentation surface, interactive simulator tab, installer script, test runner, and OKF concept must remain 100% synchronized. This playbook defines the canonical synchronization contract and the automated invariant verifier enforced by [`scripts/sync-skills.js`](/scripts/sync-skills.js) (`npm run okf:sync` / `npm run okf:sync:check`).

# Automated Synchronization & Invariant Gate (`scripts/sync-skills.js`)
Running `node scripts/sync-skills.js` (automatically invoked by [OKF Maintain Skill](/concepts/okf-maintain-skill.md) and verified in CI by `scripts/test-parser.js` via `--check`) performs two jobs:

1. **Automated Content Synchronization**:
   - **`index.html` ([Interactive Simulator & Playbook](/concepts/interactive-simulator.md))**: Injects the live `SKILL.md` and script contents for all pipeline steps (`#details-panel-2` through `#details-panel-11`, mapped via `PANEL_MAPPINGS`) directly into `<pre><code>` blocks in `index.html`.
   - **`README.md` ([The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md))**: Rewrites the `npx skills@latest update <SKILLS>` and `npx skills@latest remove <SKILLS>` command lines from the canonical `SKILLS` array (`buildSyncedReadmeMd`).
   - **Local Skill Mirrors**: Synchronizes `.agents/skills/<skill>` and `agent/skills/<skill>` mirrors when present.

2. **Cross-Repo Catalog Invariant Verification (`verifyCatalogInvariants`)**:
   - **Disk vs. `SKILLS` Registry**: Scans the repository root for all `okf` / `okf-*` directories containing a `SKILL.md` file and fails if any on-disk skill is missing from `SKILLS` or if any entry in `SKILLS` lacks `<skill>/SKILL.md` on disk.
   - **`index.html` Simulator Coverage**: Verifies every skill in `SKILLS` has a `<skill>/SKILL.md` entry in `PANEL_MAPPINGS` and a matching panel ID in `index.html`.
   - **`README.md` Documentation Coverage**: Verifies every skill in `SKILLS` is linked in both `## 🔄 The Knowledge Loop Lifecycle` (`[<skill>/SKILL.md](<skill>/SKILL.md)`) and `## 🛠️ Repository Contents` (`**[<skill>/](<skill>/)**`).
   - **Installer & Bundle Index Coverage**: Verifies every skill in `SKILLS` is registered in [OKF Upgrade Skill](/concepts/okf-upgrade-skill.md) (`okf-maintain/scripts/upgrade.js`), [Skill Installer Scripts](/concepts/skill-installers.md) (`install.ps1` and `install.sh`), [OKF Maintain Skill](/concepts/okf-maintain-skill.md) (`okf-maintain/SKILL.md`), and `docs/okf/index.md` (`concepts/<skill>-skill.md`).

3. **Public-Repo Sanitization Gate (`verifyPublicRepoSanitization`)**:
   - **Zero-Knowledge Dynamic Environment Check**: At runtime (`discoverDynamicLocalTokens`), inspects the OS username (`os.userInfo().username`), sibling/parent workspace folder names (`path.resolve(workspaceRoot, '..')` and `../..`), and custom `~/.claude-*` profiles, and fails if any local project or user identifier appears in any git-tracked file.
   - **Portable Paths, Synthetic Fixtures & Git Identity**: Fails if any tracked file contains machine-specific drive URIs (`file:///<Drive>:/`), private LAN IPs (`192.168.x.x` outside RFC 5737 `192.0.2.x`), or non-synthetic UUIDs (anything not prefixed with `00000000-`), or if the latest commit author email is not a GitHub noreply address (`@users.noreply.github.com`).

# Checklist for Adding, Modifying, or Deleting a Skill

## 1. Modifying an Existing Skill (`<skill>/SKILL.md` or `<skill>/scripts/*.js`)
1. Edit `<skill>/SKILL.md` and/or `<skill>/scripts/*.js`.
2. Update `README.md` or `index.html` prose if user-facing flags or workflow steps changed.
3. Update `docs/okf/concepts/<skill>-skill.md` and `docs/okf/log.md`.
4. Run `node scripts/sync-skills.js` and `node okf-maintain/scripts/maintain.js` (which refreshes `index.html` code panels, `README.md` CLI lists, and concept timestamps).

## 2. Adding a New Skill (`okf-<name>`)
1. **Create Skill Files**: Author `okf-<name>/SKILL.md` (with `name`, `description`, `version`) and `okf-<name>/scripts/<name>.js`.
2. **Register in `scripts/sync-skills.js`**:
   - Add `'okf-<name>'` to `SKILLS`.
   - Add its panel mapping (`{ panelId: '...', header: '# okf-<name>/SKILL.md', relFile: 'okf-<name>/SKILL.md' }`) to `PANEL_MAPPINGS`.
3. **Update `index.html` ([Interactive Simulator & Playbook](/concepts/interactive-simulator.md))**:
   - Add the `#toggle-step-N` radio input, CSS `:checked` rules, `.pipeline-card` (`#step-card-N`), and `.details-panel` (`#details-panel-N`) containing the `SKILL.md` and script `<pre><code>` panels.
4. **Update `README.md` ([The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md))**:
   - Add the step node to the `## 🔄 The Knowledge Loop Lifecycle` Mermaid diagram and add a numbered `### N.` subsection with `* **Component**: [okf-<name>/SKILL.md](okf-<name>/SKILL.md)`.
   - Add `* **[okf-<name>/](okf-<name>/)**: ...` under `## 🛠️ Repository Contents`.
5. **Register in Installers, Upgrader & `package.json`**:
   - Add `'okf-<name>'` to `OKF_SKILLS` in `okf-maintain/scripts/upgrade.js`, `$skills` in `install.ps1`, and `SKILLS` in `install.sh`.
   - Add `okf:<name>` npm script in `package.json`.
   - If the skill exports `parseFrontmatter`, add it to `parsers` in `scripts/test-parser.js`.
6. **Create OKF Concept**:
   - Create `docs/okf/concepts/okf-<name>-skill.md` and index it in `docs/okf/index.md` and `docs/okf/concepts/knowledge-loop.md`.
7. **Sync & Verify**:
   - Run `node scripts/sync-skills.js`, `node okf-maintain/scripts/maintain.js`, `node okf-lint/scripts/lint.js --drift`, and `npm test`.

## 3. Deleting or Deprecating a Skill
1. Remove the skill directory (or archive its concept via [OKF Prune Skill](/concepts/okf-prune-skill.md)).
2. Remove the skill entry from `SKILLS` and `PANEL_MAPPINGS` in `scripts/sync-skills.js`, `index.html`, `README.md`, `okf-maintain/scripts/upgrade.js`, `install.ps1`, `install.sh`, `package.json`, and `scripts/test-parser.js`.
3. Run `node scripts/sync-skills.js --check` and `npm test` to confirm zero dangling references remain.
