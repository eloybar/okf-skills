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

echo -e "\033[0;36m==========================================\033[0m"
echo -e "\033[0;36m     OKF Skills Manager for Unix (Bash)   \033[0m"
echo -e "\033[0;36m==========================================\033[0m"

# 1. Select the Agent
if [ -z "$AGENT" ]; then
    echo -e "\033[0;33mSelect the target AI Agent environment:\033[0m"
    echo "1) Google Antigravity CLI (agy)"
    echo "2) Claude Code"
    read -p "Enter choice [1-2]: " choice
    if [ "$choice" = "2" ]; then
        AGENT="Claude"
        TARGET_DIR="$CLAUDE_PATH"
    else
        AGENT="Antigravity"
        TARGET_DIR="$ANTIGRAVITY_PATH"
    fi
else
    if [ "$AGENT" = "Claude" ] || [ "$AGENT" = "claude" ]; then
        AGENT="Claude"
        TARGET_DIR="$CLAUDE_PATH"
    else
        AGENT="Antigravity"
        TARGET_DIR="$ANTIGRAVITY_PATH"
    fi
fi

echo -e "\033[0;32mTargeting: $AGENT ($TARGET_DIR)\033[0m"

# 2. Perform the Action
if [ "$ACTION" = "Remove" ] || [ "$ACTION" = "remove" ]; then
    echo -e "\033[0;33mRemoving OKF skills from $TARGET_DIR...\033[0m"
    skills=("okf" "okf-maintain" "okf-visualize")
    for skill in "${skills[@]}"; do
        SKILL_PATH="$TARGET_DIR/$skill"
        if [ -d "$SKILL_PATH" ]; then
            rm -rf "$SKILL_PATH"
            echo -e "\033[0;32m✔ Removed $skill\033[0m"
        else
            echo -e "\033[0;90mℹ $skill was not installed\033[0m"
        fi
    done
    echo -e "\033[0;32mRemoval complete!\033[0m"
else
    # Install or Update
    echo -e "\033[0;33mInstalling/Updating OKF skills in $TARGET_DIR...\033[0m"
    mkdir -p "$TARGET_DIR"

    # Determine if we are running from a local clone or from the web
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd || true)"
    if [ -d "$SCRIPT_DIR/okf" ]; then
        echo -e "\033[0;90mℹ Installing from local repository...\033[0m"
        cp -r "$SCRIPT_DIR/okf" "$SCRIPT_DIR/okf-maintain" "$SCRIPT_DIR/okf-visualize" "$TARGET_DIR/"
        echo -e "\033[0;32m✔ Installed okf, okf-maintain, and okf-visualize\033[0m"
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
        cp -r "$TEMP_DIR/okf-skills-main/okf" "$TEMP_DIR/okf-skills-main/okf-maintain" "$TEMP_DIR/okf-skills-main/okf-visualize" "$TARGET_DIR/"
        echo -e "\033[0;32m✔ Installed okf, okf-maintain, and okf-visualize\033[0m"
        
        # Cleanup
        rm -rf "$TEMP_ZIP" "$TEMP_DIR"
    fi
    echo -e "\033[0;32mInstallation/Update complete!\033[0m"
fi
