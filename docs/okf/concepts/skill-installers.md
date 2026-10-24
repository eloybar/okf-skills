---
type: Utility
title: Skill Installer Scripts
description: Automated scripts to install, update, and remove agent skills across different CLI platforms.
resource: file:///D:/projects/okf-skills/install.ps1
tags: [installation, deployment, powershell, bash]
generated:
  by: Antigravity/4.0
  at: 2026-10-24T04:22:00.000Z
sources:
  - install.sh
---

# Overview
The installer scripts, `install.ps1` (for Windows PowerShell) and `install.sh` (for macOS/Linux Bash), automate the process of registering, updating, and removing the OKF skills globally on a developer's system.

# Supported Agents & Paths
The script detects and installs the skills to the configuration folders of all active LLM agent CLIs:
- **Google Antigravity / Gemini CLI**: `~/.gemini/config/skills`
- **Claude Code**: `~/.claude/skills`
- **Universal / General Agents**: `~/.agents/skills`

# Operations
- **Install/Update**: Copies the skill directories (`okf/`, `okf-maintain/`, `okf-visualize/`, `okf-wayfinder/`, `okf-lint/`, `okf-query/`, `okf-upgrade/`, and `okf-prune/`) directly to target directories, overwriting previous versions. If run outside a clone, it fetches the zip from the GitHub main branch.
- **Remove**: Deletes the skill folders recursively from the target paths.
