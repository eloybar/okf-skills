---
type: Utility
title: Skill Installer Scripts
description: Automated scripts to install, update, and remove agent skills across different CLI platforms.
resource: install.ps1
tags: [installation, deployment, powershell, bash]
generated:
  by: Antigravity/4.0
  at: 2026-11-10T20:27:15.849Z
sources:
  - install.sh
  - .gitattributes
  - scripts/test-parser.js
  - scripts/test-lifecycle.js
---

# Overview
The installer scripts, `install.ps1` (for Windows PowerShell) and `install.sh` (for macOS/Linux Bash, enforced with pure `LF` line endings via `.gitattributes`), automate the process of registering, updating, and removing the OKF skills globally on a developer's system.

# Supported Agents & Paths
The script detects and installs the skills to the configuration folders of all active LLM agent CLIs:
- **Google Antigravity / Gemini CLI**: `~/.gemini/config/skills`
- **Claude Code**: `~/.claude/skills`, plus any custom profile directories (`~/.claude-*/skills`) and `$CLAUDE_CONFIG_DIR/skills`
- **OpenAI Codex CLI**: `~/.codex/skills`, plus any custom profile directories (`~/.codex-*/skills`) and `$CODEX_HOME/skills`
- **Universal / General Agents**: `~/.agents/skills`

# Operations
- **Install/Update**: When invoked from a clean local `okf-skills` clone (verified via `okf/SKILL.md` and `okf-maintain/SKILL.md` so project `okf/` bundles are never mistaken for the skills repo), automatically syncs the clone to `origin/main` using `git fetch origin main` + `git reset --hard origin/main` (avoiding `git pull` divergent-branch / unrelated-history failures, isolating git stderr under PowerShell `$ErrorActionPreference = "Continue"`, and reloading `install.sh` / `install.ps1` when `HEAD` changes; skippable via `--no-sync` / `-NoSync`). Copies the 7 consolidated skill directories (`okf/`, `okf-maintain/`, `okf-visualize/`, `okf-wayfinder/`, `okf-lint/`, `okf-query/`, and `okf-learn/`) directly to target directories, overwriting previous versions and removing legacy `okf-upgrade/`, `okf-prune/`, and stale nested `okf-skills/` directories. When piped non-interactively (`curl -fsSL .../install.sh | bash` or `[Console]::IsInputRedirected` in PowerShell), both installers default to `All` agents without blocking on `stdin`, and `install.sh` streams `main.tar.gz` via `tar -xz` (with `git clone --depth 1` fallback, requiring no `unzip` binary).
- **Remove**: Deletes the skill folders recursively from the target paths.
