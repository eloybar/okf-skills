#!/bin/bash
# install.sh - Installer/Updater/Remover for OKF Skills on macOS and Linux

set -e

ACTION="Install"
AGENT=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --action) ACTION="$2"; shift ;;
        --agent) AGENT="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Define default paths
ANTIGRAVITY_PATH="$HOME/.gemini/config/skills"
CLAUDE_PATH="$HOME/.claude/skills"
CODEX_PATH="$HOME/.codex/skills"
UNIVERSAL_PATH="$HOME/.agents/skills"

# Discover all Claude profile skill directories ($HOME/.claude/skills, $HOME/.claude-*/skills, and $CLAUDE_CONFIG_DIR/skills)
CLAUDE_DIRS=("$CLAUDE_PATH")
if [ -n "$CLAUDE_CONFIG_DIR" ] && [ "$CLAUDE_CONFIG_DIR/skills" != "$CLAUDE_PATH" ]; then
    CLAUDE_DIRS+=("$CLAUDE_CONFIG_DIR/skills")
fi
for prof_dir in "$HOME"/.claude-*; do
    if [ -d "$prof_dir" ]; then
        prof_skills="$prof_dir/skills"
        already_in=0
        for existing in "${CLAUDE_DIRS[@]}"; do
            if [ "$existing" = "$prof_skills" ]; then
                already_in=1
                break
            fi
        done
        if [ "$already_in" -eq 0 ]; then
            CLAUDE_DIRS+=("$prof_skills")
        fi
    fi
done

# Discover all Codex profile skill directories ($HOME/.codex/skills, $HOME/.codex-*/skills, and $CODEX_HOME/skills)
CODEX_DIRS=("$CODEX_PATH")
if [ -n "$CODEX_HOME" ] && [ "$CODEX_HOME/skills" != "$CODEX_PATH" ]; then
    CODEX_DIRS+=("$CODEX_HOME/skills")
fi
for prof_dir in "$HOME"/.codex-*; do
    if [ -d "$prof_dir" ]; then
        prof_skills="$prof_dir/skills"
        already_in=0
        for existing in "${CODEX_DIRS[@]}"; do
            if [ "$existing" = "$prof_skills" ]; then
                already_in=1
                break
            fi
        done
        if [ "$already_in" -eq 0 ]; then
            CODEX_DIRS+=("$prof_skills")
        fi
    fi
done

echo -e "\033[0;36m==========================================\033[0m"
echo -e "\033[0;36m     OKF Skills Manager for Unix (Bash)   \033[0m"
echo -e "\033[0;36m==========================================\033[0m"

# 1. Select the Agent
if [ -z "$AGENT" ]; then
    echo -e "\033[0;33mSelect the target AI Agent environment:\033[0m"
    echo "1) All Agents (Antigravity, Claude, Codex, and general agents) [Default]"
    echo "2) Google Antigravity CLI (agy)"
    echo "3) Claude Code"
    echo "4) OpenAI Codex CLI"
    read -p "Enter choice [1-4]: " choice
    if [ "$choice" = "2" ]; then
        AGENT="Antigravity"
    elif [ "$choice" = "3" ]; then
        AGENT="Claude"
    elif [ "$choice" = "4" ]; then
        AGENT="Codex"
    else
        AGENT="All"
    fi
else
    if [ "$AGENT" = "Claude" ] || [ "$AGENT" = "claude" ]; then
        AGENT="Claude"
    elif [ "$AGENT" = "Codex" ] || [ "$AGENT" = "codex" ]; then
        AGENT="Codex"
    elif [ "$AGENT" = "All" ] || [ "$AGENT" = "all" ]; then
        AGENT="All"
    else
        AGENT="Antigravity"
    fi
fi

TARGET_DIRS=()
if [ "$AGENT" = "All" ]; then
    TARGET_DIRS+=("$ANTIGRAVITY_PATH" "${CLAUDE_DIRS[@]}" "${CODEX_DIRS[@]}" "$UNIVERSAL_PATH")
    echo -e "\033[0;32mTargeting: All Agents (Antigravity, Claude profiles, Codex profiles, and general agents)\033[0m"
elif [ "$AGENT" = "Claude" ]; then
    TARGET_DIRS+=("${CLAUDE_DIRS[@]}")
    echo -e "\033[0;32mTargeting: Claude Code (${CLAUDE_DIRS[*]})\033[0m"
elif [ "$AGENT" = "Codex" ]; then
    TARGET_DIRS+=("${CODEX_DIRS[@]}")
    echo -e "\033[0;32mTargeting: OpenAI Codex CLI (${CODEX_DIRS[*]})\033[0m"
else
    TARGET_DIRS+=("$ANTIGRAVITY_PATH")
    echo -e "\033[0;32mTargeting: Google Antigravity CLI ($ANTIGRAVITY_PATH)\033[0m"
fi

# 2. Perform the Action
for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    if [ "$ACTION" = "Remove" ] || [ "$ACTION" = "remove" ]; then
        echo -e "\033[0;33mRemoving OKF skills from $TARGET_DIR...\033[0m"
        skills=("okf" "okf-maintain" "okf-visualize" "okf-wayfinder" "okf-lint" "okf-query" "okf-upgrade" "okf-prune")
        for skill in "${skills[@]}"; do
            SKILL_PATH="$TARGET_DIR/$skill"
            if [ -d "$SKILL_PATH" ]; then
                rm -rf "$SKILL_PATH"
                echo -e "\033[0;32m✔ Removed $skill\033[0m"
            else
                echo -e "\033[0;90mℹ $skill was not installed\033[0m"
            fi
        done
    else
        # Install or Update
        echo -e "\033[0;33mInstalling/Updating OKF skills in $TARGET_DIR...\033[0m"
        mkdir -p "$TARGET_DIR"

        # Determine if we are running from a local clone or from the web
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd || true)"
        if [ -d "$SCRIPT_DIR/okf" ]; then
            echo -e "\033[0;90mℹ Installing from local repository...\033[0m"
            cp -r "$SCRIPT_DIR/okf" "$SCRIPT_DIR/okf-maintain" "$SCRIPT_DIR/okf-visualize" "$SCRIPT_DIR/okf-wayfinder" "$SCRIPT_DIR/okf-lint" "$SCRIPT_DIR/okf-query" "$SCRIPT_DIR/okf-upgrade" "$SCRIPT_DIR/okf-prune" "$TARGET_DIR/"
            echo -e "\033[0;32m✔ Installed okf, okf-maintain, okf-visualize, okf-wayfinder, okf-lint, okf-query, okf-upgrade, and okf-prune in $TARGET_DIR\033[0m"
        else
            echo -e "\033[0;90mℹ Downloading latest version from GitHub...\033[0m"
            TEMP_ZIP="/tmp/okf-skills.zip"
            TEMP_DIR="/tmp/okf-skills-temp"
            
            # Download zip
            curl -fsSL "https://github.com/eloybar/okf-skills/archive/refs/heads/main.zip" -o "$TEMP_ZIP"
            
            # Extract zip
            rm -rf "$TEMP_DIR"
            mkdir -p "$TEMP_DIR"
            unzip -q "$TEMP_ZIP" -d "$TEMP_DIR"
            
            # Copy skills
            cp -r "$TEMP_DIR/okf-skills-main/okf" "$TEMP_DIR/okf-skills-main/okf-maintain" "$TEMP_DIR/okf-skills-main/okf-visualize" "$TEMP_DIR/okf-skills-main/okf-wayfinder" "$TEMP_DIR/okf-skills-main/okf-lint" "$TEMP_DIR/okf-skills-main/okf-query" "$TEMP_DIR/okf-skills-main/okf-upgrade" "$TEMP_DIR/okf-skills-main/okf-prune" "$TARGET_DIR/"
            echo -e "\033[0;32m✔ Installed okf, okf-maintain, okf-visualize, okf-wayfinder, okf-lint, okf-query, okf-upgrade, and okf-prune in $TARGET_DIR\033[0m"
            
            # Cleanup
            rm -rf "$TEMP_ZIP" "$TEMP_DIR"
        fi
    fi
done

echo -e "\033[0;32mOperation complete!\033[0m"
