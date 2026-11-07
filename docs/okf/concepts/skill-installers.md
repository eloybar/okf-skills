---
type: Utility
title: Skill Installer Scripts
description: Automated scripts to install, update, and remove agent skills across different CLI platforms.
resource: install.ps1
tags: [installation, deployment, powershell, bash]
generated:
  by: Antigravity/4.0
  at: 2026-11-07T16:09:03.827Z
sources:
  - install.sh
---

# Overview
The installer scripts, `install.ps1` (for Windows PowerShell) and `install.sh` (for macOS/Linux Bash), automate the process of registering, updating, and removing the OKF skills globally on a developer's system.

# Supported Agents & Paths
The script detects and installs the skills to the configuration folders of all active LLM agent CLIs:
- **Google Antigravity / Gemini CLI**: `~/.gemini/config/skills`
- **Claude Code**: `~/.claude/skills`, plus any custom profile directories (`~/.claude-*/skills`) and `$CLAUDE_CONFIG_DIR/skills`
- **OpenAI Codex CLI**: `~/.codex/skills`, plus any custom profile directories (`~/.codex-*/skills`) and `$CODEX_HOME/skills`
- **Universal / General Agents**: `~/.agents/skills`

# Operations
- **Install/Update**: Copies the 7 consolidated skill directories (`okf/`, `okf-maintain/`, `okf-visualize/`, `okf-wayfinder/`, `okf-lint/`, `okf-query/`, and `okf-learn/`) directly to target directories, overwriting previous versions and removing legacy `okf-upgrade/` and `okf-prune/` directories. If run outside a clone, it fetches the zip from the GitHub main branch.
- **Remove**: Deletes the skill folders recursively from the target paths.
